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

// --- LET'S ENCRYPT ISRG ROOT X1 -JUURIVARMENNE ---
// Tämä on julkinen luottamustieto, ei salaisuus — Render käyttää Let's Encryptin
// varmenteita, ja ESP32 tarvitsee tämän tunnistaakseen palvelimen varmenteen aidoksi.
// TÄRKEÄ: tarkista tämä aina virallisesta lähteestä (letsencrypt.org/certs/isrgrootx1.pem)
// ennen käyttöä, koska yksikin väärä merkki estää yhteyden toimimisen.
const char* ROOT_CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
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

// Lähettää mittauksen backendille HTTPS POST -pyynnöllä
void uploadMeasurement(float tempC, bool sensorOk, String timestamp) { // Ottaa lämpötilan, tilan ja aikaleiman
  WiFiClientSecure client;                                  // Luodaan suojattu (HTTPS) yhteysolio
  client.setCACert(ROOT_CA_CERT);                            // Asetetaan luotettu juurivarmenne yhteydelle

  HTTPClient https;                                          // Luodaan korkean tason HTTPS-pyyntöolio
  String url = "https://" + String(backendHost) + "/measurements"; // Rakennetaan täysi osoite

  if (!https.begin(client, url)) {                           // Aloitetaan yhteys annettuun osoitteeseen
    Serial.println("HTTPS-yhteyden aloitus epäonnistui");      // Jos epäonnistuu, tulostetaan virhe ja lopetetaan
    return;
  }

  https.addHeader("Content-Type", "application/json");       // Kerrotaan palvelimelle, että runko on JSON-muotoa
  https.addHeader("X-API-Key", apiKey);                       // Lisätään API-avain otsikkoon, jotta backend hyväksyy pyynnön

  String payload = buildUploadPayload(tempC, sensorOk, timestamp); // Rakennetaan lähetettävä JSON-data
  int httpCode = https.POST(payload);                         // Lähetetään POST-pyyntö ja saadaan HTTP-statuskoodi takaisin

  if (httpCode > 0) {                                         // Jos saatiin jokin vastaus (ei verkkovirhettä)...
    Serial.printf("Pilvilähetys: HTTP %d\n", httpCode);          // ...tulostetaan statuskoodi (esim. 201 = onnistui)
    String response = https.getString();                       // Luetaan palvelimen vastauksen runko
    Serial.println(response);                                   // Tulostetaan se debug-tarkoituksiin
  } else {                                                    // Jos pyyntö epäonnistui kokonaan (esim. ei yhteyttä)...
    Serial.printf("Pilvilähetys epäonnistui: %s\n", https.errorToString(httpCode).c_str()); // Tulostetaan virhe
  }

  https.end();                                                // Suljetaan yhteys siististi
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
    uploadMeasurement(tempC, sensorOk, timestamp);                             // Lähetetään data backendille
  }

  delay(2);
}