#include <WiFi.h>             // ESP32:n Wi-Fi-toiminnot (yhteyden muodostus kotiverkkoon)
#include <WebServer.h>        // Mahdollistaa pienen HTTP-palvelimen pyörittämisen ESP32:lla
#include <OneWire.h>          // Matala tason kirjasto OneWire-väylän (DS18B20:n käyttämä) lukemiseen
#include <DallasTemperature.h>// Korkean tason kirjasto, joka osaa lukea DS18B20-anturin lämpötilan helposti
#include <ESPmDNS.h>          // Mahdollistaa laitteen löytymisen nimellä (esim. wemos-mittari.local) IP-osoitteen sijaan
#include <WiFiUdp.h>          // UDP-tietoliikenne, jota ArduinoOTA tarvitsee taustalla toimiakseen
#include <ArduinoOTA.h>       // Mahdollistaa koodin päivittämisen langattomasti Wi-Fin yli (Over-The-Air)
#include <time.h>             // Tarjoaa ajan/kellon käsittelyfunktiot (NTP-ajan muotoiluun)
#include "secrets.h"          // Erillinen tiedosto, jossa Wi-Fi- ja OTA-salasanat pidetään poissa julkisesta koodista

const char* ssid = SECRET_SSID;             // Luetaan Wi-Fi-verkon nimi secrets.h-tiedostosta
const char* password = SECRET_PASSWORD;     // Luetaan Wi-Fi-verkon salasana secrets.h-tiedostosta

// --- ANTURIN ASETUKSET ---
#define ONE_WIRE_BUS 4              // Määritellään, että DS18B20-anturi on kytketty ESP32:n pinniin numero 4
OneWire oneWire(ONE_WIRE_BUS);      // Luodaan OneWire-väyläolio käyttämään määriteltyä pinniä
DallasTemperature sensors(&oneWire);// Luodaan lämpötila-anturiolio, joka käyttää yllä luotua OneWire-väylää

// Luodaan web-palvelin porttiin 80
WebServer server(80);               // Luodaan HTTP-palvelinolio, joka kuuntelee standardiporttia 80 (normaali web-liikenne)

// =================================================================
// PUHTAAT LOGIIKKAFUNKTIOT — eivät kosketa Wi-Fi/anturia/palvelinta.
// Näitä voi yksikkötestata PlatformIO+Unity-kehyksellä ilman laitteistoa.
// =================================================================

// Tarkistaa, on lämpötila-arvo kelvollinen (anturi ei ole irti/vioittunut)
bool isValidTemperature(float tempC) {                     // Funktio, joka ottaa lämpötilan parametrina sisään
  return tempC != DEVICE_DISCONNECTED_C;                    // Palauttaa true, jos arvo EI ole anturin virhearvo
}

// Muotoilee lämpötilan tekstiksi kahden desimaalin tarkkuudella
String formatTemperature(float tempC) {                    // Funktio, joka muotoilee lämpötilan tekstimuotoon
  return String(tempC, 2);                                   // Palauttaa lämpötilan merkkijonona, 2 desimaalia
}

// Muodostaa nykyisen ajan ISO 8601 -muotoisena aikaleimana ("unknown" jos kello ei ole synkassa)
String getTimestamp() {                                     // Funktio, joka palauttaa nykyisen UTC-ajan tekstimuodossa
  struct tm timeinfo;                                        // Luodaan rakenne, johon kellonaika tallennetaan
  if (!getLocalTime(&timeinfo)) {                             // Yritetään hakea aika; jos epäonnistuu...
    return "unknown";                                          // ...palautetaan "unknown", jotta JSON ei mene rikki
  }
  char buf[26];                                               // Puskuri muotoillulle aikaleimalle (1 merkki enemmän Z:lle)
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo); // Muotoillaan UTC-aika ISO 8601 -tyyliin, Z = UTC-merkki
  return String(buf);                                         // Palautetaan muotoiltu UTC-aikaleima
}

// Rakentaa koko JSON-vastauksen valmiista, jo luetuista arvoista — EI lue anturia itse.
// Tämä on testattavuuden kannalta tärkein funktio: sille voi antaa mitä tahansa
// arvoja testissä, eikä se koskaan kutsu Wi-Fi/anturi/palvelin-koodia.
String buildJsonResponse(float tempC, bool sensorOk, String timestamp) { // Ottaa lämpötilan, tilan ja ajan parametreina
  String json = "{";                                          // Aloitetaan JSON-merkkijonon rakentaminen aaltosulkeella
  json += "\"device\":\"wemos-mittari\",";                    // Lisätään JSON:iin kenttä "device" laitteen nimellä
  json += "\"timestamp\":\"" + timestamp + "\",";              // Lisätään JSON:iin kenttä "timestamp" annetulla aikaleimalla
  if (sensorOk) {                                             // Tarkistetaan onko anturi kunnossa (annettu parametrina)
    json += "\"status\":\"OK\",";                                // Jos kunnossa, merkitään tila "OK"
    json += "\"temperature\":" + formatTemperature(tempC);       // Lisätään lämpötila numerona (ei lainausmerkeissä, JSON-luku)
  } else {                                                    // Jos anturi ei ollut kunnossa...
    json += "\"status\":\"ERROR\",";                             // ...merkitään tila "ERROR"
    json += "\"temperature\":null";                              // ...ja lämpötilaksi JSON null-arvo (ei numeroa)
  }
  json += "}";                                                // Suljetaan JSON-olio loppukaarisulkeella
  return json;                                                // Palautetaan koko JSON-merkkijono kutsujalle
}

// =================================================================
// LAITTEISTORIIPPUVAISET FUNKTIOT — näitä ei voi yksikkötestata ilman
// oikeaa ESP32:ta ja anturia, koska ne kutsuvat sensors/server-olioita.
// =================================================================

// =================================================================
// WI-FI-YHTEYDEN VALVONTA — tarkistaa yhteyden ja yrittää korjata sen
// =================================================================

unsigned long lastWifiCheck = 0;              // Tallentaa milloin Wi-Fi-tila viimeksi tarkistettiin (millis()-aikaleima)
unsigned long wifiDownSince = 0;              // Tallentaa milloin yhteys havaittiin poikki (0 = yhteys on kunnossa)
const unsigned long WIFI_CHECK_INTERVAL = 10000;   // Tarkistetaan yhteys 10 sekunnin välein, ei jatkuvasti
const unsigned long WIFI_RESTART_THRESHOLD = 120000; // Jos yhteys on poikki yli 2 minuuttia, käynnistetään laite kokonaan uudelleen

void checkWifiConnection() {                              // Funktio, joka tarkistaa ja korjaa Wi-Fi-yhteyden tarvittaessa
  if (millis() - lastWifiCheck < WIFI_CHECK_INTERVAL) {     // Tarkistetaan onko tarkistusväli vielä kesken
    return;                                                  // Jos kyllä, poistutaan funktiosta tekemättä mitään (säästää suorituskykyä)
  }
  lastWifiCheck = millis();                                 // Päivitetään viimeisin tarkistusajankohta nykyhetkeen

  if (WiFi.status() == WL_CONNECTED) {                      // Tarkistetaan, onko Wi-Fi-yhteys kunnossa
    wifiDownSince = 0;                                        // Jos kunnossa, nollataan "yhteys poikki" -ajanlasku
    return;                                                   // Poistutaan funktiosta, ei tarvita toimenpiteitä
  }

  Serial.println("Wi-Fi-yhteys poikki, yritetään yhdistää uudelleen...");  // Ilmoitetaan ongelmasta sarjamonitoriin

  if (wifiDownSince == 0) {                                 // Jos tämä on ensimmäinen kerta kun yhteys havaittiin poikki...
    wifiDownSince = millis();                                 // ...tallennetaan ajanhetki, jolloin yhteys katkesi
  }

  WiFi.disconnect();                                        // Katkaistaan nykyinen (rikkinäinen) yhteys siististi
  WiFi.begin(ssid, password);                               // Yritetään yhdistää uudelleen samoilla tunnuksilla

  if (millis() - wifiDownSince > WIFI_RESTART_THRESHOLD) {  // Jos yhteys on ollut poikki liian pitkään uudelleenyrityksistä huolimatta...
    Serial.println("Wi-Fi ei palautunut, käynnistetään laite kokonaan uudelleen...");  // Ilmoitetaan viimeisestä keinosta
    delay(1000);                                              // Pieni viive, jotta Serial-tulostus ehtii lähteä ulos ennen uudelleenkäynnistystä
    ESP.restart();                                            // Käynnistetään ESP32 kokonaan uudelleen (sama kuin virtojen katko/kytkentä)
  }
}

// 1. Palauttaa pelkän lämpötilan tekstinä (esim. "22.50")
void handleTemp() {                                  // Funktio, joka ajetaan kun selain/asiakas pyytää osoitetta /temp
  sensors.requestTemperatures();                      // Pyydetään anturilta uusi lämpötilamittaus
  float tempC = sensors.getTempCByIndex(0);           // Luetaan ensimmäisen (indeksi 0) anturin lämpötila celsiusasteina
  if (isValidTemperature(tempC)) {                    // Käytetään eriytettyä funktiota arvon kelvollisuuden tarkistukseen
    server.send(200, "text/plain", formatTemperature(tempC)); // Lähetetään HTTP 200 -vastaus, lämpötila muotoiltuna tekstinä
  } else {                                            // Jos anturi oli irti tai ei vastannut...
    server.send(500, "text/plain", "Error: Sensor disconnected"); // ...lähetetään HTTP 500-virhevastaus selkeällä viestillä
  }
}

// 2. Palauttaa tiedot JSON-muodossa käyttöliittymää varten
void handleJsonApi() {                                       // Funktio, joka ajetaan kun selain/asiakas pyytää osoitetta /api
  sensors.requestTemperatures();                              // Pyydetään anturilta uusi lämpötilamittaus
  float tempC = sensors.getTempCByIndex(0);                   // Luetaan ensimmäisen anturin lämpötila celsiusasteina
  bool sensorOk = isValidTemperature(tempC);                   // Tarkistetaan kelvollisuus eriytetyllä funktiolla
  String timestamp = getTimestamp();                           // Haetaan nykyinen aikaleima eriytetyllä funktiolla
  String json = buildJsonResponse(tempC, sensorOk, timestamp); // Rakennetaan JSON-vastaus eriytetyllä, testattavalla funktiolla
  server.send(200, "application/json", json);                 // Lähetetään koko JSON-merkkijono HTTP 200 -vastauksena
}

void setup() {                                  // setup() ajetaan vain kerran, kun ESP32 käynnistyy
  Serial.begin(115200);                          // Käynnistetään sarjaliikenne 115200 baudin nopeudella (USB-debug-tulostukseen)
  sensors.begin();                               // Alustetaan DallasTemperature-kirjasto käyttövalmiiksi

  // Yhdistetään Wi-Fi-verkkoon
  WiFi.begin(ssid, password);                    // Aloitetaan Wi-Fi-yhteyden muodostus annetulla verkon nimellä ja salasanalla
  while (WiFi.status() != WL_CONNECTED) {        // Odotetaan silmukassa, kunnes yhteys on muodostunut
    delay(500);                                   // Pieni tauko, jotta silmukka ei pyöri turhan tiiviisti
    Serial.print(".");                            // Tulostetaan piste sarjamonitoriin merkiksi siitä, että yhä odotetaan
  }
  Serial.println("\nWi-Fi yhdistetty!");          // Kun yhteys on muodostunut, tulostetaan vahvistusviesti
  Serial.print("IP-osoite: ");                    // Tulostetaan teksti ennen IP-osoitetta
  Serial.println(WiFi.localIP());                 // Tulostetaan laitteen saama paikallinen IP-osoite

  // --- NTP-AJAN ASETUS ---
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");           // Asetetaan aikavyöhyke (UTC+0) ja NTP-palvelimet
  Serial.println("Synkronoidaan aikaa NTP:stä...");            // Tulostetaan tila: aikaa yritetään hakea netistä
  struct tm timeinfo;                                          // Luodaan rakenne saadulle ajalle
  unsigned long ntpStart = millis();                           // Tallennetaan ajanhetki, jolloin NTP-yritys alkoi (timeoutia varten)
  while (!getLocalTime(&timeinfo)) {                           // Yritetään hakea aikaa, kunnes se onnistuu...
    Serial.print(".");                                          // ...tulostetaan piste merkiksi yrityksestä
    delay(500);                                                 // Pieni tauko yritysten välillä
    if (millis() - ntpStart > 10000) {                          // Jos yli 10 sekuntia on kulunut ilman onnistumista...
      Serial.println("\nNTP-aikaa ei saatu, jatketaan ilman sitä."); // ...kerrotaan käyttäjälle epäonnistumisesta
      break;                                                     // ...ja poistutaan silmukasta, jotta laite ei jää pysyvästi jumiin
    }
  }
  if (timeinfo.tm_year > 0) {                                  // Tarkistetaan saatiinko aika oikeasti asetettua (vuosi on järkevä)
    Serial.println("\nAika synkronoitu!");                      // Jos kyllä, ilmoitetaan onnistumisesta
  }

  // Määritetään mDNS, jotta laitteeseen pääsee käsiksi osoitteella http://wemos-mittari.local
  if (MDNS.begin("wemos-mittari")) {              // Yritetään käynnistää mDNS-palvelu annetulla nimellä; palauttaa true onnistuessaan
    Serial.println("mDNS käynnistetty (wemos-mittari.local)"); // Ilmoitetaan onnistumisesta sarjamonitoriin
  }

  // Reititetään API-osoitteet oikeisiin toimintoihin
  server.on("/temp", handleTemp);                 // Kun joku pyytää osoitetta /temp, ajetaan handleTemp()-funktio
  server.on("/api", handleJsonApi);                // Kun joku pyytää osoitetta /api, ajetaan handleJsonApi()-funktio
  server.begin();                                  // Käynnistetään web-palvelin kuuntelemaan pyyntöjä
  Serial.println("API-palvelin käynnistetty.");    // Ilmoitetaan sarjamonitoriin, että palvelin on käynnissä

  // --- ALUSTETAAN OTA (LANGATON PÄIVITYS) ---
  ArduinoOTA.setHostname("wemos-mittari");         // Asetetaan laitteen nimi, jolla se näkyy OTA-laitelistassa
  ArduinoOTA.setPassword(SECRET_OTAPASSWORD);      // Asetetaan OTA-salasana secrets.h:sta, joka vaaditaan päivityksen aloittamiseen
  ArduinoOTA.onStart([]() {                        // Määritellään mitä tehdään, kun OTA-päivitys alkaa (anonyymi funktio)
    Serial.println("Langaton päivitys alkaa...");   // Tulostetaan ilmoitus päivityksen alkamisesta
  });
  ArduinoOTA.onEnd([]() {                          // Määritellään mitä tehdään, kun OTA-päivitys päättyy onnistuneesti
    Serial.println("\nValmis!");                     // Tulostetaan ilmoitus päivityksen valmistumisesta
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) { // Määritellään mitä tehdään päivityksen edistyessä
    Serial.printf("Edistyminen: %u%%\r", (progress / (total / 100)));    // Tulostetaan edistyminen prosentteina samalle rivillä (\r)
  });
  ArduinoOTA.onError([](ota_error_t error) {       // Määritellään mitä tehdään, jos OTA-päivityksessä tapahtuu virhe
    Serial.printf("Virhe [%u]: ", error);            // Tulostetaan virhekoodi sarjamonitoriin
  });
  ArduinoOTA.begin();                              // Käynnistetään OTA-palvelu kuuntelemaan tulevia päivityksiä
  Serial.println("OTA-päivitys valmiudessa.");      // Ilmoitetaan, että laite on valmis vastaanottamaan langattomia päivityksiä
}

void loop() {                        // loop() ajetaan toistuvasti, niin kauan kuin laitteeseen on virta kytkettynä
  checkWifiConnection();              // Tarkistetaan ja korjataan Wi-Fi-yhteys tarvittaessa (katso funktio yllä)
  server.handleClient();              // Tarkistetaan ja käsitellään mahdolliset saapuneet HTTP-pyynnöt (esim. /api, /temp)
  ArduinoOTA.handle();                // Tarkistetaan, yrittääkö joku aloittaa langattoman koodipäivityksen juuri nyt
  delay(2);                           // Pieni 2 millisekunnin viive, joka pitää ESP32:n taustaprosessit vakaina
}