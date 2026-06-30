#include <WiFi.h>             // ESP32:n Wi-Fi-toiminnot
#include <WebServer.h>        // Pieni HTTP-palvelin ESP32:lla (oma /temp ja /api edelleen käytössä)
#include <OneWire.h>          // Matalan tason OneWire-väylän luku
#include <DallasTemperature.h>// DS18B20-anturin lukukirjasto
#include <ESPmDNS.h>          // Laitteen löytyminen nimellä (wemos-mittari.local)
#include <WiFiUdp.h>          // ArduinoOTA:n tarvitsema UDP-tietoliikenne
#include <ArduinoOTA.h>       // Langaton koodipäivitys
#include <WiFiClientSecure.h> // HTTPS-yhteyden hoitava kirjasto (UUSI)
#include <HTTPClient.h>       // Korkean tason HTTP/HTTPS-pyyntökirjasto (UUSI)
#include <time.h>             // Ajan/kellon käsittely (NTP)
#include "esp_wifi.h"         // Poistetaan WiFin virransäästö
#include "secrets.h"          // Wi-Fi-, OTA- ja API-salasanat

const char* ssid = SECRET_SSID;             // Wi-Fi-verkon nimi
const char* password = SECRET_PASSWORD;     // Wi-Fi-verkon salasana
const char* backendHost = SECRET_BACKEND_HOST; // Backendin osoite (esim. iot-temp-pipeline.onrender.com)
const char* apiKey = SECRET_API_KEY;         // API-avain, joka todistaa backendille että pyyntö on aito

// --- ANTURIN ASETUKSET ---
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WebServer server(80);

// --- GOOGLE TRUST SERVICES WE1 -VÄLISERTIFIKAATTI ---
// Tämä on julkinen luottamustieto, ei salaisuus — Render käyttää Cloudflaren kautta
// Google Trust Servicesin WE1-sertifikaattia, ja ESP32 tarvitsee tämän tunnistaakseen
// palvelimen varmenteen aidoksi.
// TÄRKEÄ: tarkista tämä aina virallisesta lähteestä (http://i.pki.goog/we1.crt)
// ennen käyttöä, koska yksikin väärä merkki estää yhteyden toimimisen.
// Huom: tämä sertifikaatti vanhenee 2029-02-20 — päivitä silloin uuteen.
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

// --- AJASTUS PILVILÄHETYKSELLE ---
unsigned long lastUploadTime = 0;                  // Milloin data lähetettiin viimeksi (millis()-aikaleima)
const unsigned long UPLOAD_INTERVAL = 10UL * 60UL * 1000UL; // 10 minuuttia millisekunteina (10 * 60 * 1000)

// =================================================================
// PUHTAAT LOGIIKKAFUNKTIOT
// =================================================================

bool isValidTemperature(float tempC) {                     // Tarkistaa onko lämpötila kelvollinen
  return tempC != DEVICE_DISCONNECTED_C && tempC != 85.0;    // Pois suljetaan myös DS18B20:n tunnettu virhearvo 85.0
}

String formatTemperature(float tempC) {                     // Muotoilee lämpötilan tekstiksi
  return String(tempC, 2);
}

String getTimestamp() {                                      // Palauttaa nykyisen UTC-ajan ISO 8601 -muodossa
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "unknown";
  }
  char buf[26];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo); // Z = UTC-merkki
  return String(buf);
}

String buildJsonResponse(float tempC, bool sensorOk, String timestamp) { // Rakentaa JSON-vastauksen /api-reitille
  String json = "{";
  json += "\"device\":\"wemos-mittari\",";
  json += "\"timestamp\":\"" + timestamp + "\",";
  if (sensorOk) {
    json += "\"status\":\"OK\",";
    json += "\"temperature\":" + formatTemperature(tempC);
  } else {
    json += "\"status\":\"ERROR\",";
    json += "\"temperature\":null";
  }
  json += "}";
  return json;
}

// Rakentaa JSON-rungon, joka lähetetään backendille POST-pyynnössä.
// Huom: kentät ovat camelCase-muodossa (deviceId, measuredAt), koska
// server.js:n koodi lukee req.body:stä juuri näillä nimillä.
String buildUploadPayload(float tempC, bool sensorOk, String timestamp) { // Rakentaa POST-pyynnön JSON-rungon
  String json = "{";
  json += "\"deviceId\":\"wemos-mittari\",";
  json += "\"status\":\"" + String(sensorOk ? "OK" : "ERROR") + "\",";
  json += "\"temperature\":" + (sensorOk ? formatTemperature(tempC) : "null") + ",";
  json += "\"measuredAt\":\"" + timestamp + "\"";
  json += "}";
  return json;
}

// =================================================================
// LAITTEISTORIIPPUVAISET FUNKTIOT
// =================================================================

unsigned long lastWifiCheck = 0;
unsigned long wifiDownSince = 0;
const unsigned long WIFI_CHECK_INTERVAL = 10000;
const unsigned long WIFI_RESTART_THRESHOLD = 120000;

void checkWifiConnection() {                              // Tarkistaa ja korjaa Wi-Fi-yhteyden tarvittaessa
  if (millis() - lastWifiCheck < WIFI_CHECK_INTERVAL) {
    return;
  }
  lastWifiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    wifiDownSince = 0;
    return;
  }

  Serial.println("Wi-Fi-yhteys poikki, yritetään yhdistää uudelleen...");

  if (wifiDownSince == 0) {
    wifiDownSince = millis();
  }

  WiFi.disconnect();
  WiFi.begin(ssid, password);

  if (millis() - wifiDownSince > WIFI_RESTART_THRESHOLD) {
    Serial.println("Wi-Fi ei palautunut, käynnistetään laite kokonaan uudelleen...");
    delay(1000);
    ESP.restart();
  }
}

bool uploadMeasurement(float tempC, bool sensorOk, String timestamp) { // Palauttaa true jos lähetys onnistui, false jos epäonnistui
  WiFiClientSecure client;                                              // Luodaan suojattu (HTTPS) yhteysolio
  //client.setInsecure(); // VÄLIAIKAINEN — ohitetaan varmenteen tarkistus debuggausta varten
  client.setCACert(ROOT_CA_CERT);                                       // Asetetaan luotettu juurivarmenne yhteydelle

  HTTPClient https;                                                     // Luodaan korkean tason HTTPS-pyyntöolio
  String url = "https://" + String(backendHost) + "/measurements";     // Rakennetaan täysi osoite
  Serial.printf("Yhdistetään: %s\n", url.c_str());  // Tulostetaan täysi URL varmistukseksi
  client.setTimeout(40000); // 40 sekuntia timeoutiksi
  https.setTimeout(40000);  // sama HTTP-tasolle
  if (!https.begin(client, url)) {                                      // Aloitetaan yhteys annettuun osoitteeseen
    Serial.println("HTTPS-yhteyden aloitus epäonnistui");               // Jos epäonnistuu, tulostetaan virhe...
    return false;                                                        // ...ja palautetaan epäonnistuminen
  }

  https.addHeader("Content-Type", "application/json");                  // Kerrotaan palvelimelle että runko on JSON-muotoa
  https.addHeader("X-API-Key", apiKey);                                 // Lisätään API-avain otsikkoon jotta backend hyväksyy pyynnön

  String payload = buildUploadPayload(tempC, sensorOk, timestamp);      // Rakennetaan lähetettävä JSON-data
  int httpCode = https.POST(payload);                                    // Lähetetään POST-pyyntö ja saadaan HTTP-statuskoodi takaisin

  if (httpCode > 0) {                                                   // Jos saatiin jokin vastaus (ei verkkovirhettä)...
    Serial.printf("Pilvilähetys: HTTP %d\n", httpCode);                 // ...tulostetaan statuskoodi (esim. 201 = onnistui)
    String response = https.getString();                                 // Luetaan palvelimen vastauksen runko
    Serial.println(response);                                            // Tulostetaan se debug-tarkoituksiin
    https.end();                                                         // Suljetaan yhteys siististi
    return httpCode == 200 || httpCode == 201;                           // Palautetaan true jos HTTP-koodi on 200 tai 201 (onnistuminen)
  } else {                                                              // Jos pyyntö epäonnistui kokonaan (esim. ei yhteyttä)...
    Serial.printf("Pilvilähetys epäonnistui: %s\n", https.errorToString(httpCode).c_str()); // ...tulostetaan virheen kuvaus
    https.end();                                                         // Suljetaan yhteys siististi myös virhetilanteessa
    return false;                                                        // Palautetaan epäonnistuminen
  }
}

void handleTemp() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  if (isValidTemperature(tempC)) {
    server.send(200, "text/plain", formatTemperature(tempC));
  } else {
    server.send(500, "text/plain", "Error: Sensor disconnected");
  }
}

void handleJsonApi() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  bool sensorOk = isValidTemperature(tempC);
  String timestamp = getTimestamp();
  String json = buildJsonResponse(tempC, sensorOk, timestamp);
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  sensors.begin();

  WiFi.begin(ssid, password);
  esp_wifi_set_ps(WIFI_PS_NONE);   // Sammutetaan Wi-Fi-virransäästö, pitäisi parantaa yhteyden vakautta
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi yhdistetty!");
  Serial.print("IP-osoite: ");
  Serial.println(WiFi.localIP());

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");          // Puhdas UTC, ei aikavyöhykesiirtymää
  Serial.println("Synkronoidaan aikaa NTP:stä...");
  struct tm timeinfo;
  unsigned long ntpStart = millis();
  while (!getLocalTime(&timeinfo)) {
    Serial.print(".");
    delay(500);
    if (millis() - ntpStart > 10000) {
      Serial.println("\nNTP-aikaa ei saatu, jatketaan ilman sitä.");
      break;
    }
  }
  if (timeinfo.tm_year > 0) {
    Serial.println("\nAika synkronoitu!");
  }

  if (MDNS.begin("wemos-mittari")) {
    Serial.println("mDNS käynnistetty (wemos-mittari.local)");
  }

  server.on("/temp", handleTemp);
  server.on("/api", handleJsonApi);
  server.begin();
  Serial.println("API-palvelin käynnistetty.");

  ArduinoOTA.setHostname("wemos-mittari");
  ArduinoOTA.setPassword(SECRET_OTAPASSWORD);
  ArduinoOTA.onStart([]() {
    Serial.println("Langaton päivitys alkaa...");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nValmis!");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Edistyminen: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Virhe [%u]: ", error);
  });
  ArduinoOTA.begin();
  Serial.println("OTA-päivitys valmiudessa.");
}

void loop() {
  checkWifiConnection();                       // Tarkistetaan ja korjataan Wi-Fi-yhteys tarvittaessa
  server.handleClient();                       // Käsitellään saapuvat HTTP-pyynnöt (/temp, /api)
  ArduinoOTA.handle();                         // Kuunnellaan langattomia koodipäivityksiä

  if (millis() - lastUploadTime >= UPLOAD_INTERVAL || lastUploadTime == 0) { // Jos 10 min on kulunut TAI ekakerta
    lastUploadTime = millis();                                                // Päivitetään viimeisin lähetysajankohta
    sensors.requestTemperatures();                                            // Pyydetään uusi lämpötilamittaus
    float tempC = sensors.getTempCByIndex(0);                                 // Luetaan lämpötila
    bool sensorOk = isValidTemperature(tempC);                                // Tarkistetaan kelvollisuus
    String timestamp = getTimestamp();                                        // Haetaan nykyinen UTC-aikaleima
    // Render-palvelin (ilmaistaso) nukahtaa ~15 min käyttämättömyyden jälkeen.
    // Pitkä timeout (40s) HTTPS-yhteydessä antaa palvelimelle aikaa herätä yhden
    // yrityksen sisällä. Backend on idempotentti (ON CONFLICT DO NOTHING Neonissa),
    // joten satunnainen epäonnistunut lähetys on harmiton — data tallentuu
    // viimeistään seuraavalla 10 min kierroksella, eikä koskaan tupla-kirjaudu.
    Serial.println("Lähetetään mittaus...");                                  // Tulostetaan lähetyksen alkaminen
    bool success = uploadMeasurement(tempC, sensorOk, timestamp);              // Yritetään lähettää data backendille
    if (!success) {                                                           // Jos lähetys epäonnistui...
      Serial.println("Lähetys epäonnistui, yritetään seuraavalla 10 min kierroksella"); // ...kerrotaan ettei hätää, yritetään myöhemmin
    }
  }

  delay(2);
}