# IoT Temp Pipeline

Henkilökohtainen IoT-harrasteprojekti: ulkolämpötilan mittaus kerrostalon parvekkeelta ESP32:lla, datan tallennus pilveen, ja tulevaisuudessa React-dashboard, joka vertailee mittausta sääennusteeseen.

Projektin tavoite ei ole vain saada laite toimimaan, vaan opetella ja dokumentoida ammattimaisia käytänteitä koko ketjun varrella — laitteisto, backend, tietokanta ja frontend.

## Tila: rakenteilla 🚧

Tämä on aktiivisesti kehitteillä oleva harrasteprojekti. Osat valmistuvat vaiheittain, ks. alla.

## Arkkitehtuuri
ESP32 (anturi) → Backend (Node.js/Express) → Tietokanta (Neon/PostgreSQL)

↑

React-dashboard

Laite ei koskaan kommunikoi suoraan tietokannan kanssa — kaikki kulkee oman backendin läpi, jotta tietokanta on helppo vaihtaa myöhemmin tarvittaessa.

ESP32 myös tarjoaa oman pienen HTTP-rajapinnan kotiverkon sisällä (`/temp`, `/api`), erillään pilviyhteydestä — tämä mahdollistaa laitteen tilan tarkistamisen suoraan paikallisverkossa ilman pilven kautta kiertämistä.

## Projektin rakenne
iot-temp-pipeline/

├── firmware/

│   └── wemos-mittari/      # ESP32-koodi (Arduino/C++)

├── backend/                 # Node.js + Express API

├── frontend/                # React-dashboard (tulossa)

└── README.md

## Tekninen pino

- **Laitteisto:** Wemos D1 R32 (ESP32) + DS18B20-lämpötila-anturi
- **Firmware:** Arduino/C++, langaton OTA-päivitys, HTTPS-yhteys pilveen (Let's Encrypt Root CA)
- **Backend:** Node.js + Express, API-avain-suojaus kirjoitusreiteille
- **Tietokanta:** Neon (serverless PostgreSQL)
- **Hosting:** Render (backend)
- **Frontend:** React + Vite + TypeScript (GitHub Pages)
- **CI/CD:** GitHub Actions (frontendin automaattinen build + deploy) 
- **Sääntövertailu:** MET Norway / Yr.no API (suunnitteilla)

## Edistyminen

- [x] ESP32 lukee DS18B20-anturia ja tarjoaa datan HTTP-rajapinnan kautta (`/temp`, `/api`)
- [x] Langaton OTA-päivitys toimii
- [x] UTC-aikaleimat mittauksiin
- [x] Neon-tietokanta pystyssä, perustaulut (`devices`, `measurements`) luotuna
- [x] Backend yhdistetty Neon-tietokantaan (`pg`-kirjasto, eristetty `database.js`-kerros)
- [x] Backend julkaistu Renderiin
- [x] API-reitit mittauksille ja laitetiedoille (`POST /measurements`, `GET /measurements/:deviceId`, `GET /devices/:deviceId`)
- [x] Kirjoitusreitti suojattu API-avaimella
- [x] ESP32 lähettää datan backendille HTTPS POST -pyynnöllä, 10 min välein
- [x] React-dashboard: luotu + yhteys palvelimeen saatu
- [x] React-dashboard: nykytilanteen näyttö
- [x] Frontend julkaistu GitHub Pagesiin (CI/CD: GitHub Actions)
- [x] Idempotenssi-suoja tietokantaan (estää duplikaattimittaukset)
- [ ] React-dashboard: historiakuvaaja
- [ ] Sääennusteen vertailu (Yr.no)

## Asennus (firmware)

Tarvittavat kirjastot (asenna Arduino IDE:n Library Managerilla):
- OneWire
- DallasTemperature

(WiFi, WebServer, ESPmDNS, WiFiUdp, ArduinoOTA, WiFiClientSecure, HTTPClient sisältyvät ESP32-piirilevytukeen)

Luo `firmware/wemos-mittari/secrets.h` mallin `secrets.h.example` pohjalta omilla tunnuksillasi. Tarvittavat arvot: Wi-Fi-tunnukset, OTA-salasana, backendin API-avain ja backend-osoite. Huomaa, että koodi sisältää kovakoodatun Root CA -varmenteen, joka voi vaatia päivitystä, jos Renderin varmenneketju muuttuu.

## Asennus (backend)

```bash
cd backend
npm install
npm start
```

Tarvitsee `.env`-tiedoston (ks. `.env.example`) Neon-yhteysmerkkijonolle ja API-avaimelle.

## Tausta

Tämä projekti on syntynyt halusta yhdistää harrastelaitteisto oikeaan, ammattimaisten käytänteiden mukaiseen pilviarkkitehtuuriin — ei vain "saada se toimimaan", vaan ymmärtää ja perustella jokainen rakenteellinen päätös matkan varrella.

Projektin yhtenä tavoitteena oli harjoitella, miten tekoälyä kannattaa hyödyntää suunnittelussa ja toteutuksessa — ei vain nopeuttaa tekemistä, vaan oppia tarkoituksenmukaista käyttöä. Claude toimi keskustelukumppanina arkkitehtuurivalinnoissa, virheenselvityksessä ja koodin laadun parantamisessa; päätökset ja toteutus ovat omia. 

Iso osa oppimisesta tapahtui debugatessa — muutama esimerkki seuraavassa.
## Kohdatut haasteet

Muutama esimerkki ongelmista, joita matkan varrella ratkaistiin — pidetty mukana, koska ongelmanratkaisu on ollut yhtä iso osa oppimista kuin lopputulos.

**OTA-päivitys katkesi satunnaisesti ("Broken pipe")**
ESP32:n Wi-Fi-virransäästötila aiheutti pieniä yhteyskatkoja pitkien siirtojen aikana. Korjattu lisäämällä `esp_wifi_set_ps(WIFI_PS_NONE)`.

**Sama mittaus tallentui useita kertoja**
HTTP-timeout oli lyhyempi kuin Renderin ilmaistason herätysaika, jolloin ESP32 luuli pyynnön epäonnistuneen ja yritti uudelleen, vaikka data oli jo tallentunut. Korjattu pidentämällä timeoutia ja lisäämällä idempotenssi-suoja tietokantaan (UNIQUE-rajoite + ON CONFLICT DO NOTHING).

**SSL-yhteys epäonnistui varmennevirheen takia**
HTTPS-yhteys Renderiin epäonnistui toistuvasti myös retry-yritysten kanssa. Koodissa ollut Root CA -varmenne (ISRG Root X1 / Let's Encrypt) ei vastannut palvelimen oikeasti käyttämää sertifikaattia — Render kulkee Cloudflaren kautta, joka käyttää Google Trust Servicesin WE1-sertifikaattia. Syy paljastui kokeilemalla client.setInsecure(), joka osoitti ongelman olevan varmenteessa, ei verkkoyhteydessä; varsinainen issuer vahvistettiin curl -vI-komennolla ja SSL Labs -analyysillä. Korjattu vaihtamalla koodiin oikea WE1-välisertifikaatti.

**Julkinen kirjoitusreitti oli täysin suojaamaton**
Kuka tahansa internetissä olisi voinut lähettää mielivaltaista dataa /measurements-reittiin. Korjattu lisäämällä API-avain-suojaus POST-reitille, jättäen lukureitit tarkoituksella avoimiksi dashboardia varten.

**CORS ja puuttuva riippuvuus Renderissä**
Backend toimi paikallisesti, mutta julkaistu versio Renderissä ei vastannut — syynä oli `cors`-paketti, joka oli asennettu vain paikalliseen `node_modules`-kansioon muttei koskaan päätynyt `package.json`-tiedostoon, joten Render ei asentanut sitä.