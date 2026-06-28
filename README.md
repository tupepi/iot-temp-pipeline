# IoT Temp Pipeline

Henkilökohtainen IoT-harrasteprojekti: ulkolämpötilan mittaus kerrostalon parvekkeelta ESP32:lla, datan tallennus pilveen, ja tulevaisuudessa React-dashboard, joka vertailee mittausta sääennusteeseen.

Projektin tavoite ei ole vain saada laite toimimaan, vaan opetella ja dokumentoida ammattimaisia käytänteitä koko ketjun varrella — laitteisto, backend, tietokanta ja frontend.

## Tila: rakenteilla 🚧

Tämä on aktiivisesti kehitteillä oleva harrasteprojekti. Osat valmistuvat vaiheittain, ks. alla.

## Arkkitehtuuri
ESP32 (anturi) → Backend (Node.js/Express) → Tietokanta (Neon/PostgreSQL)

↑

React-dashboard (tulossa)

Laite ei koskaan kommunikoi suoraan tietokannan kanssa — kaikki kulkee oman backendin läpi, jotta tietokanta on helppo vaihtaa myöhemmin tarvittaessa.

## Projektin rakenne
iot-temp-pipeline/

├── firmware/

│   └── wemos-mittari/      # ESP32-koodi (Arduino/C++)

├── backend/                 # Node.js + Express API

├── frontend/                # React-dashboard (tulossa)

└── README.md

## Tekninen pino

- **Laitteisto:** Wemos D1 R32 (ESP32) + DS18B20-lämpötila-anturi
- **Firmware:** Arduino/C++, langaton OTA-päivitys
- **Backend:** Node.js + Express
- **Tietokanta:** Neon (serverless PostgreSQL)
- **Hosting:** Render (backend)
- **Frontend:** React (suunnitteilla)
- **Sääntövertailu:** MET Norway / Yr.no API (suunnitteilla)

## Edistyminen

- [x] ESP32 lukee DS18B20-anturia ja tarjoaa datan HTTP-rajapinnan kautta (`/temp`, `/api`)
- [x] Langaton OTA-päivitys toimii
- [x] UTC-aikaleimat mittauksiin
- [x] Neon-tietokanta pystyssä, perustaulut (`devices`, `measurements`) luotuna
- [x] Paikallinen Express-palvelin käynnistyy ja vastaa
- [ ] Backend yhdistetty Neon-tietokantaan
- [ ] Backend julkaistu Renderiin
- [ ] ESP32 lähettää datan backendille (POST, 15 min välein)
- [ ] React-dashboard: nykytilanne + historiakuvaaja
- [ ] Sääennusteen vertailu (Yr.no)

## Asennus (firmware)

Tarvittavat kirjastot (asenna Arduino IDE:n Library Managerilla):
- OneWire
- DallasTemperature

(WiFi, WebServer, ESPmDNS, WiFiUdp, ArduinoOTA sisältyvät ESP32-piirilevytukeen)

Luo `firmware/wemos-mittari/secrets.h` mallin `secrets.h.example` pohjalta omilla tunnuksillasi.

## Asennus (backend)

```bash
cd backend
npm install
npm start
```

Tarvitsee `.env`-tiedoston (ks. `.env.example`) Neon-yhteysmerkkijonolle.

## Tausta

Tämä projekti on syntynyt halusta yhdistää harrastelaitteisto oikeaan, ammattimaisten käytänteiden mukaiseen pilviarkkitehtuuriin — ei vain "saada se toimimaan", vaan ymmärtää ja perustella jokainen rakenteellinen päätös matkan varrella.

Projektin yhtenä tavoitteena oli harjoitella, miten tekoälyä kannattaa hyödyntää suunnittelussa ja toteutuksessa — ei vain nopeuttaa tekemistä, vaan oppia tarkoituksenmukaista käyttöä. Claude toimi keskustelukumppanina arkkitehtuurivalinnoissa, virheenselvityksessä ja koodin laadun parantamisessa; päätökset ja toteutus ovat omia. 