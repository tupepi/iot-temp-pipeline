#include <WiFi.h> // Wi-Fi-yhteyden hallintaan
#include <WebServer.h> // Yksinkertaisen HTTP-palvelimen tarjoamiseen (mittausdata /api-reitiltä)
#include <OneWire.h> // OneWire-väylän ajuri DS18B20-anturille
#include <DallasTemperature.h> // Dallas-lämpötila-antureiden lukemiseen
#include <ESPmDNS.h> // mDNS-nimipalvelu (wemos-mittari.local)
#include <ArduinoOTA.h> // Ohjelmiston päivitys langattomasti (OTA)
#include <WiFiClientSecure.h> // TLS-suojattu Wi-Fi-asiakas pilviyhteyttä varten
#include <HTTPClient.h> // HTTP(S)-pyyntöjen tekemiseen
#include "esp_wifi.h" // ESP32:n Wi-Fi-virransäästöasetuksia varten
#include "secrets.h" // Salaiset tunnukset (SSID, salasana, API-avain, jne.)

// --- ASETUKSET & MUUTTUJAT ---
const char* ssid = SECRET_SSID; // Wi-Fi-verkon nimi
const char* password = SECRET_PASSWORD; // Wi-Fi-verkon salasana
const char* backendHost = SECRET_BACKEND_HOST; // Backendin osoite mittausten lähetykseen
const char* apiKey = SECRET_API_KEY; // API-avain backendin tunnistautumiseen

#define ONE_WIRE_BUS 4 // DS18B20-anturin datapinni (GPIO4)
OneWire oneWire(ONE_WIRE_BUS); // OneWire-väyläolio määritetyssä pinnissä
DallasTemperature sensors(&oneWire); // Lämpötila-anturiolio OneWire-väylän päällä

WebServer server(80); // HTTP-palvelin portissa 80

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
)EOF"; // Varmenteen loppu (raw string -literaalin päätös)

unsigned long lastUploadTime = 0; // Ajanhetki (ms) jolloin mittaus lähetettiin viimeksi
const unsigned long UPLOAD_INTERVAL = 10UL * 60UL * 1000UL; // Lähetysväli: 10 minuuttia millisekunteina

// =================================================================
// LOGIIKKAFUNKTIOT
// =================================================================

bool isValidTemperature(float tempC) { // Tarkistaa onko anturin lukema kelvollinen
  return tempC != DEVICE_DISCONNECTED_C && tempC != 85.0; // Hylätään anturin virhearvot (irti/oletuslukema)
} // Funktion loppu

String getTimestamp() { // Muodostaa ISO 8601 -aikaleiman NTP-ajasta
  struct tm timeinfo; // Aikarakenne, johon nykyaika puretaan
  if (!getLocalTime(&timeinfo)) return "unknown"; // Jos aikaa ei saada, palautetaan "unknown"
  char buf[26]; // Puskuri muotoillulle aikaleimalle
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo); // Muotoillaan aika ISO 8601 -muotoon
  return String(buf); // Palautetaan aikaleima Arduino-merkkijonona
} // Funktion loppu

String buildJson(float tempC, bool sensorOk, String timestamp, bool isUpload) { // Rakentaa JSON-vastauksen/-rungon
  String json = "{"; // Aloitetaan JSON-olio
  json += isUpload ? "\"deviceId\":\"wemos-mittari\"," : "\"device\":\"wemos-mittari\","; // Kenttänimi vaihtelee käyttötarkoituksen mukaan
  if (!isUpload) json += "\"timestamp\":\"" + timestamp + "\","; // /api-vastaukseen lisätään aikaleima erikseen
  json += "\"status\":\"" + String(sensorOk ? "OK" : "ERROR") + "\","; // Anturin tilatieto
  json += "\"temperature\":" + (sensorOk ? String(tempC, 2) : "null"); // Lämpötila kahden desimaalin tarkkuudella tai null
  if (isUpload) json += ",\"measuredAt\":\"" + timestamp + "\""; // Pilvilähetykseen lisätään mittausajan kenttä
  json += "}"; // Suljetaan JSON-olio
  return json; // Palautetaan valmis JSON-merkkijono
} // Funktion loppu

// =================================================================
// VERKKO- JA PILVIFUNKTIOT
// =================================================================

unsigned long lastWifiCheck = 0; // Ajanhetki (ms) jolloin Wi-Fi tarkistettiin viimeksi
unsigned long wifiDownSince = 0; // Ajanhetki (ms) jolloin Wi-Fi havaittiin poikki (0 = ei poikki)

void checkWifiConnection() { // Tarkistaa ja yrittää palauttaa Wi-Fi-yhteyden
  if (millis() - lastWifiCheck < 10000) return; // Tarkistetaan korkeintaan 10 sekunnin välein
  lastWifiCheck = millis(); // Päivitetään viimeisin tarkistusaika

  if (WiFi.status() == WL_CONNECTED) { // Jos yhteys on kunnossa
    wifiDownSince = 0; // Nollataan katkosajan laskuri
    return; // Ei muuta tehtävää
  } // If-lohkon loppu

  Serial.println("Wi-Fi-yhteys poikki, yritetään yhdistää uudelleen..."); // Lokitetaan katkos
  if (wifiDownSince == 0) wifiDownSince = millis(); // Merkitään milloin katkos alkoi

  WiFi.disconnect(); // Katkaistaan mahdollinen jäänteinen yhteys
  WiFi.begin(ssid, password); // Yritetään yhdistää uudelleen

  if (millis() - wifiDownSince > 120000) { // Jos yhteys on ollut poikki yli 2 minuuttia
    Serial.println("Wi-Fi ei palautunut, käynnistetään laite uudelleen..."); // Lokitetaan uudelleenkäynnistys
    delay(1000); // Annetaan aikaa lokiviestin lähetykselle
    ESP.restart(); // Käynnistetään laite uudelleen
  } // If-lohkon loppu
} // Funktion loppu

bool uploadMeasurement(float tempC, bool sensorOk, String timestamp) { // Lähettää mittauksen backendiin HTTPS:n yli
  WiFiClientSecure client; // TLS-asiakasolio pilviyhteyttä varten
  client.setCACert(ROOT_CA_CERT); // Asetetaan luotettu juurivarmenne
  client.setTimeout(40000); // Aikakatkaisu 40 sekuntia

  HTTPClient https; // HTTP(S)-pyyntöjen tekijä
  https.setTimeout(40000); // Aikakatkaisu 40 sekuntia

  Serial.printf("Yhdistetään: https://%s/measurements\n", backendHost); // Lokitetaan kohdeosoite
  if (!https.begin(client, "https://" + String(backendHost) + "/measurements")) { // Aloitetaan HTTPS-pyyntö
    Serial.println("HTTPS-yhteyden aloitus epäonnistui"); // Lokitetaan epäonnistuminen
    return false; // Palautetaan epäonnistuminen kutsujalle
  } // If-lohkon loppu

  https.addHeader("Content-Type", "application/json"); // Kerrotaan rungon olevan JSON-muotoinen
  https.addHeader("X-API-Key", apiKey); // Lisätään API-avain tunnistautumista varten

  int httpCode = https.POST(buildJson(tempC, sensorOk, timestamp, true)); // Lähetetään mittaus POST-pyynnöllä

  if (httpCode > 0) { // Jos palvelin vastasi (ei yhteysvirhettä)
    Serial.printf("Pilvilähetys: HTTP %d\n", httpCode); // Lokitetaan HTTP-statuskoodi
    Serial.println(https.getString()); // Lokitetaan palvelimen vastausrunko
    https.end(); // Suljetaan HTTPS-yhteys
    return httpCode == 200 || httpCode == 201; // Onnistunut vain 200/201-vastauksilla
  } else { // Jos yhteydessä tai pyynnössä tapahtui virhe
    Serial.printf("Pilvilähetys epäonnistui: %s\n", https.errorToString(httpCode).c_str()); // Lokitetaan virheteksti
    https.end(); // Suljetaan HTTPS-yhteys
    return false; // Palautetaan epäonnistuminen kutsujalle
  } // If/else-lohkon loppu
} // Funktion loppu

void checkScheduledRestart() { // Käynnistää laitteen uudelleen kerran vuorokaudessa klo 03:00
  struct tm timeinfo; // Aikarakenne, johon nykyaika puretaan
  if (getLocalTime(&timeinfo) && timeinfo.tm_hour == 3 && timeinfo.tm_min == 0 && timeinfo.tm_sec < 5) { // Tarkistetaan ollaanko klo 03:00 tienoilla
    Serial.println("Ajastettu uudelleenkäynnistys (klo 03:00)..."); // Lokitetaan uudelleenkäynnistys
    delay(1000); // Annetaan aikaa lokiviestin lähetykselle
    ESP.restart(); // Käynnistetään laite uudelleen
  } // If-lohkon loppu
} // Funktion loppu

void handleJsonApi() { // /api-reitin käsittelijä: palauttaa nykyisen lämpötilan JSON-muodossa
  sensors.requestTemperatures(); // Pyydetään anturilta tuore lämpötilalukema
  float tempC = sensors.getTempCByIndex(0); // Luetaan ensimmäisen anturin lämpötila
  server.send(200, "application/json", buildJson(tempC, isValidTemperature(tempC), getTimestamp(), false)); // Vastataan JSON-oliolla
} // Funktion loppu

// =================================================================
// SETUP & LOOP
// =================================================================

void setup() { // Ajetaan kerran käynnistyksen yhteydessä
  Serial.begin(115200); // Käynnistetään sarjaportti lokitusta varten
  sensors.begin(); // Alustetaan lämpötila-anturit

  WiFi.begin(ssid, password); // Aloitetaan Wi-Fi-yhteyden muodostus
  esp_wifi_set_ps(WIFI_PS_NONE); // Poistetaan Wi-Fi-virransäästö (parempi vasteaika)
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); } // Odotetaan yhteyden muodostumista

  Serial.println("\nWi-Fi yhdistetty!"); // Lokitetaan onnistunut yhteys
  Serial.print("IP-osoite: "); // Lokitetaan otsikko IP-osoitteelle
  Serial.println(WiFi.localIP()); // Lokitetaan laitteen IP-osoite

  configTime(0, 0, "pool.ntp.org", "time.nist.gov"); // Asetetaan NTP-ajanhaku (UTC, ei kesäaikaa)
  struct tm timeinfo; // Aikarakenne NTP-ajan onnistumisen tarkistukseen
  unsigned long ntpStart = millis(); // Ajanhetki NTP-haun aloituksesta
  while (!getLocalTime(&timeinfo) && (millis() - ntpStart < 10000)) { delay(500); } // Odotetaan NTP-aikaa max 10s

  if (MDNS.begin("wemos-mittari")) Serial.println("mDNS: wemos-mittari.local"); // Käynnistetään mDNS-nimipalvelu

  server.on("/api", handleJsonApi); // Rekisteröidään /api-reitin käsittelijä
  server.begin(); // Käynnistetään HTTP-palvelin

  ArduinoOTA.setHostname("wemos-mittari"); // Asetetaan OTA-päivityksen laitenimi
  ArduinoOTA.setPassword(SECRET_OTAPASSWORD); // Asetetaan OTA-päivityksen salasana
  ArduinoOTA.begin(); // Käynnistetään OTA-päivityspalvelu

  Serial.println("Palvelimet ja OTA valmiina."); // Lokitetaan alustuksen valmistuminen
} // Funktion loppu

void loop() { // Ajetaan jatkuvasti uudelleen
  checkWifiConnection(); // Tarkistetaan ja tarvittaessa palautetaan Wi-Fi-yhteys
  checkScheduledRestart(); // Tarkistetaan ajastettu uudelleenkäynnistys
  server.handleClient(); // Käsitellään mahdolliset HTTP-pyynnöt
  ArduinoOTA.handle(); // Käsitellään mahdolliset OTA-päivityspyynnöt

  if (millis() - lastUploadTime >= UPLOAD_INTERVAL || lastUploadTime == 0) { // Onko lähetysväli täynnä (tai ensimmäinen kierros)
    lastUploadTime = millis(); // Päivitetään viimeisin lähetysaika
    sensors.requestTemperatures(); // Pyydetään anturilta tuore lämpötilalukema
    float tempC = sensors.getTempCByIndex(0); // Luetaan ensimmäisen anturin lämpötila

    Serial.println("Lähetetään mittaus..."); // Lokitetaan lähetyksen aloitus
    if (!uploadMeasurement(tempC, isValidTemperature(tempC), getTimestamp())) { // Yritetään lähettää mittaus backendiin
      Serial.println("Lähetys epäonnistui, yritetään 10 min päästä."); // Lokitetaan epäonnistuminen
    } // If-lohkon loppu
  } // If-lohkon loppu

  delay(2); // Pieni viive silmukan kevyempään kuormitukseen
} // Funktion loppu
