#include <WiFi.h>
#include <WebServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "esp_wifi.h"
#include "secrets.h"

// --- ASETUKSET & MUUTTUJAT ---
const char* ssid = SECRET_SSID;
const char* password = SECRET_PASSWORD;
const char* backendHost = SECRET_BACKEND_HOST;
const char* apiKey = SECRET_API_KEY;

#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WebServer server(80);

// --- GOOGLE TRUST SERVICES WE1 (Voimassa 2029-02-20 asti) ---
const char* ROOT_CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIICjjCCAjOgAwIBAgIQf/NXaJvCTjAtkOGKQb0OHzAKBggqhkjOPQQDAjBQMSQw
IgYDVQQLExtHbG9iYWxTaWduIEVDQyBSb290IENBIC0gUjQxEzARBgNVBAoTCkds
b2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMjMxMjEzMDkwMDAwWhcN
MjkwMjIwMTQwMDAwWjA7MQswCQYDVQQGEwJVUzEeMBwGA1UEChMVR29vZ2xlIFRy
dXN0IFNlcnZpY2VzMQwwCgYDVQQDEwNXRTEwWTATBgcqhkjOPQIBBggqhkjOPQMB
BwNCAARvzTr+Z1dHTCEDhUDCR127WEcPQMFcF4XGGTfn1XzthkubgdnXGhOlCgP4
mMTG6J7/EFmPLCaY9eYmJbsPAvpWo4IBAjCB/zAOBgNVHQ8BAf8EBAMCAYYwHQYD
VR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMBIGA1UdEwEB/wQIMAYBAf8CAQAw
HQYDVR0OBBYEFJB3kjVnxP+ozKnme9mAeXvMk/k4MB8GA1UdIwQYMBaAFFSwe61F
uOJAf/sKbvu+M8k8o4TVMDYGCCsGAQUFBwEBBCowKDAmBggrBgEFBQcwAoYaaHR0
cDovL2kucGtpLmdvb2cvZ3NyNC5jcnQwLQYDVR0fBCYwJDAioCCgHoYcaHR0cDov
L2MucGtpLmdvb2cvci9nc3I0LmNybDATBgNVHSAEDDAKMAgGBmeBDAECATAKBggq
hkjOPQQDAgNJADBGAiEAokJL0LgR6SOLR02WWxccAq3ndXp4EMRveXMUVUxMWSMC
IQDspFWa3fj7nLgouSdkcPy1SdOR2AGm9OQWs7veyXsBwA==
-----END CERTIFICATE-----
)EOF";

unsigned long lastUploadTime = 0;
const unsigned long UPLOAD_INTERVAL = 10UL * 60UL * 1000UL;

// =================================================================
// LOGIIKKAFUNKTIOT
// =================================================================

bool isValidTemperature(float tempC) {
  return tempC != DEVICE_DISCONNECTED_C && tempC != 85.0;
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "unknown";
  char buf[26];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

String buildJson(float tempC, bool sensorOk, String timestamp, bool isUpload) {
  String json = "{";
  json += isUpload ? "\"deviceId\":\"wemos-mittari\"," : "\"device\":\"wemos-mittari\",";
  if (!isUpload) json += "\"timestamp\":\"" + timestamp + "\",";
  json += "\"status\":\"" + String(sensorOk ? "OK" : "ERROR") + "\",";
  json += "\"temperature\":" + (sensorOk ? String(tempC, 2) : "null");
  if (isUpload) json += ",\"measuredAt\":\"" + timestamp + "\"";
  json += "}";
  return json;
}

// =================================================================
// VERKKO- JA PILVIFUNKTIOT
// =================================================================

unsigned long lastWifiCheck = 0;
unsigned long wifiDownSince = 0;

void checkWifiConnection() {
  if (millis() - lastWifiCheck < 10000) return;
  lastWifiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    wifiDownSince = 0;
    return;
  }

  Serial.println("Wi-Fi-yhteys poikki, yritetään yhdistää uudelleen...");
  if (wifiDownSince == 0) wifiDownSince = millis();

  WiFi.disconnect();
  WiFi.begin(ssid, password);

  if (millis() - wifiDownSince > 120000) {
    Serial.println("Wi-Fi ei palautunut, käynnistetään laite uudelleen...");
    delay(1000);
    ESP.restart();
  }
}

bool uploadMeasurement(float tempC, bool sensorOk, String timestamp) {
  WiFiClientSecure client;
  client.setCACert(ROOT_CA_CERT);
  client.setTimeout(40000);

  HTTPClient https;
  https.setTimeout(40000);
  
  Serial.printf("Yhdistetään: https://%s/measurements\n", backendHost);
  if (!https.begin(client, "https://" + String(backendHost) + "/measurements")) {
    Serial.println("HTTPS-yhteyden aloitus epäonnistui");
    return false;
  }

  https.addHeader("Content-Type", "application/json");
  https.addHeader("X-API-Key", apiKey);

  int httpCode = https.POST(buildJson(tempC, sensorOk, timestamp, true));

  if (httpCode > 0) {
    Serial.printf("Pilvilähetys: HTTP %d\n", httpCode);
    Serial.println(https.getString());
    https.end();
    return httpCode == 200 || httpCode == 201;
  } else {
    Serial.printf("Pilvilähetys epäonnistui: %s\n", https.errorToString(httpCode).c_str());
    https.end();
    return false;
  }
}

void checkScheduledRestart() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo) && timeinfo.tm_hour == 3 && timeinfo.tm_min == 0 && timeinfo.tm_sec < 5) {
    Serial.println("Ajastettu uudelleenkäynnistys (klo 03:00)...");
    delay(1000);
    ESP.restart();
  }
}

void handleJsonApi() {
  sensors.requestTemperatures();
  server.send(200, "application/json", buildJson(tempC, isValidTemperature(sensors.getTempCByIndex(0)), getTimestamp(), false));
}

// =================================================================
// SETUP & LOOP
// =================================================================

void setup() {
  Serial.begin(115200);
  sensors.begin();

  WiFi.begin(ssid, password);
  esp_wifi_set_ps(WIFI_PS_NONE);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  
  Serial.println("\nWi-Fi yhdistetty!");
  Serial.print("IP-osoite: ");
  Serial.println(WiFi.localIP());

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  unsigned long ntpStart = millis();
  while (!getLocalTime(&timeinfo) && (millis() - ntpStart < 10000)) { delay(500); }

  if (MDNS.begin("wemos-mittari")) Serial.println("mDNS: wemos-mittari.local");

  server.on("/api", handleJsonApi);
  server.begin();

  ArduinoOTA.setHostname("wemos-mittari");
  ArduinoOTA.setPassword(SECRET_OTAPASSWORD);
  ArduinoOTA.begin();
  
  Serial.println("Palvelimet ja OTA valmiina.");
}

void loop() {
  checkWifiConnection();
  checkScheduledRestart();
  server.handleClient();
  ArduinoOTA.handle();

  if (millis() - lastUploadTime >= UPLOAD_INTERVAL || lastUploadTime == 0) {
    lastUploadTime = millis();
    sensors.requestTemperatures();
    float tempC = sensors.getTempCByIndex(0);
    
    Serial.println("Lähetetään mittaus...");
    if (!uploadMeasurement(tempC, isValidTemperature(tempC), getTimestamp())) {
      Serial.println("Lähetys epäonnistui, yritetään 10 min päästä.");
    }
  }

  delay(2);
}