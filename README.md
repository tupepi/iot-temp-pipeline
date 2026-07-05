# IoT Temp Pipeline

Rakensin tämän projektin oppiakseni IoT-järjestelmien rakentamista — laitteistosta pilveen ja käyttöliittymään asti. Parvekkeen ulkolämpötila oli helppo ja konkreettinen testikohde: anturi on halpa, data yksinkertaista, mutta koko ketju on oikea. Suunnitteilla on vaativampia projekteja joissa tarvitaan samoja taitoja, ja tämä toimi hyvänä pohjana niitä varten.

Lopputulos on ESP32-mikrokontrolleri kerrostalon parvekkeella, joka mittaa ulkolämpötilaa ja lähettää datan kymmenen minuutin välein pilveen. React-dashboard vertailee mitattua lämpötilaa Yr.no:n sääennusteeseen samalta ajanjaksolta.

## Miten se toimii

Wemos D1 R32 -kehitysalusta ja DS18B20-anturi mittaavat lämpötilan ja lähettävät sen HTTPS-yhteydellä Node.js-backendille, joka tallentaa datan PostgreSQL-tietokantaan. Erillinen cron job hakee tunnin välein Yr.no:n ennustedatan ja tallentaa sen samaan tietokantaan. React-dashboard hakee molemmat datat backendilta ja piirtää ne samaan kuvaajaan — sininen viiva on mitattu lämpötila, punainen ennuste.

Laite ei koskaan kommunikoi suoraan tietokannan kanssa — kaikki kulkee oman backendin läpi, jotta tietokanta on helppo vaihtaa myöhemmin tarvittaessa. Laite päivitetään langattomasti OTA-tekniikalla, joten se voi pysyä parvekkeella virroissa ilman USB-kaapelia. ESP32 tarjoaa myös oman pienen HTTP-rajapinnan kotiverkon sisällä (`/api`), joka mahdollistaa laitteen tilan tarkistamisen suoraan paikallisverkossa.

## Tekninen pino

- **Laitteisto:** Wemos D1 R32 (ESP32) + DS18B20-lämpötila-anturi
- **Firmware:** Arduino/C++, langaton OTA-päivitys, HTTPS-yhteys pilveen (Google Trust Services WE1)
- **Backend:** Node.js + Express, API-avain-suojaus kirjoitusreiteille
- **Tietokanta:** Neon (serverless PostgreSQL)
- **Hosting:** Render (backend + cron job)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + Framer Motion (GitHub Pages)
- **CI/CD:** GitHub Actions (frontendin automaattinen build + deploy)
- **Säädata:** MET Norway / Yr.no API (Locationforecast 2.0), Render Cron Job

## Projektin rakenne

iot-temp-pipeline/
├── firmware/
│ └── wemos-mittari/ # ESP32-koodi (Arduino/C++)
├── backend/ # Node.js + Express API
├── frontend/ # React-dashboard
└── README.md

## Mitä opin

Projekti opetti enemmän kuin odotin — ei niinkään yksittäisiä teknologioita, vaan kokonaisuuden hallintaa: miten laitteisto, verkko, tietokanta ja käyttöliittymä kommunikoivat keskenään, ja mitä tapahtuu kun jokin niistä pettää.

Konkreettisia esimerkkejä matkan varrelta: ESP32:n Wi-Fi-virransäästötila katkaisi OTA-päivitykset satunnaisesti. Renderin herätysaika oli pidempi kuin ESP32:n HTTP-timeout, jonka seurauksena sama mittaus tallentui tietokantaan useaan kertaan ennen kuin idempotenssi-suoja ratkaisi ongelman. Koodiin kovakoodattu Root CA -varmenne osoittautui vääräksi — Render käyttää Google Trust Servicesin WE1-sertifikaattia Let's Encryptin sijaan, mikä selvisi vasta `client.setInsecure()`-testin ja SSL Labs -analyysin kautta.

Projektin yhtenä tavoitteena oli myös harjoitella tekoälyn hyödyntämistä kehitystyössä — ei vain nopeuttaa tekemistä, vaan oppia milloin ja miten sitä kannattaa käyttää. Claude toimi keskustelukumppanina arkkitehtuurivalinnoissa ja virheenselvityksessä; päätökset ja toteutus ovat omia.

## Asennus (firmware)

Tarvittavat kirjastot (asenna Arduino IDE:n Library Managerilla): OneWire, DallasTemperature. WiFi, WebServer, ESPmDNS, WiFiUdp, ArduinoOTA, WiFiClientSecure ja HTTPClient sisältyvät ESP32-piirilevytukeen.

Luo `firmware/wemos-mittari/secrets.h` mallin `secrets.h.example` pohjalta. Tarvittavat arvot: Wi-Fi-tunnukset, OTA-salasana, backendin API-avain ja backend-osoite. Koodi sisältää kovakoodatun Root CA -varmenteen, joka voi vaatia päivitystä jos Renderin varmenneketju muuttuu.

## Asennus (backend)

```bash
cd backend
npm install
npm start
```

Tarvitsee `.env`-tiedoston (ks. `.env.example`) Neon-yhteysmerkkijonolle ja API-avaimelle.

## Linkit

[Dashboard](https://tuukkap.com/iot-temp-pipeline/) · [GitHub](https://github.com/tupepi/iot-temp-pipeline)
