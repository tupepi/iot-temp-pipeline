const express = require("express"); // Tuodaan Express-kirjasto
const cors = require("cors"); // Tuodaan CORS-middleware (sallii pyynnöt eri origineista)
const {
  // Tuodaan tarvittavat funktiot database.js:stä
  saveMeasurement, // Mittauksen tallennusfunktio
  getRecentMeasurements, // Mittausten hakufunktio
  getDevice, // Laitteen hakufunktio
  getWeatherForecasts, // Sääennusteiden hakufunktio
} = require("./database"); // Tuodaan tietokantafunktiot

const app = express(); // Luodaan Express-sovellusolio
const PORT = process.env.PORT || 3000; // Render asettaa PORT-muuttujan automaattisesti

app.use(cors()); // Otetaan CORS käyttöön kaikille reiteille
app.use(express.json()); // Otetaan käyttöön JSON-rungon automaattinen jäsennys

const MAX_QUERY_HOURS = 24 * 30; // Suurin sallittu aikaväli tunteina (30 vrk), estää raskaat kyselyt

// Jäsentää tuntimäärän query-parametrista turvallisesti (oletusarvo ja ylärajan rajaus)
function parseHours(value, defaultValue) { // Ottaa raakaparametrin ja oletusarvon
  const parsed = parseInt(value, 10); // Yritetään muuntaa parametri kokonaisluvuksi
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue; // Puuttuva, NaN tai epäkelpo arvo -> oletus
  return Math.min(parsed, MAX_QUERY_HOURS); // Rajataan ylös suurimpaan sallittuun arvoon
} // Funktion loppu

// Kääre async-reiteille: hoitaa virheen lokituksen ja 500-vastauksen yhdessä paikassa
function asyncHandler(handler, logMessage, errorMessage) { // Ottaa varsinaisen käsittelijän ja virheviestit
  return async (req, res) => { // Palautetaan Express-reitille sopiva funktio
    try { // Ajetaan varsinainen käsittelijä
      await handler(req, res); // Kutsutaan alkuperäistä logiikkaa
    } catch (error) { // Jos käsittelijä heittää virheen...
      console.error(logMessage, error); // ...lokitetaan koko virhe-olio (opittu aiemmasta!)
      res.status(500).json({ error: errorMessage }); // Yleinen virhevastaus kutsujalle
    } // Catch-lohkon loppu
  }; // Palautettavan funktion loppu
} // Funktion loppu

// Middleware: tarkistaa että pyynnössä on oikea API-avain
function checkApiKey(req, res, next) { // Funktio, joka ajetaan ennen suojattua reittiä
  const apiKey = req.headers["x-api-key"]; // Luetaan avain pyynnön omasta otsikosta (header)
  if (!apiKey || apiKey !== process.env.DEVICE_API_KEY) { // Tarkistetaan puuttuuko avain TAI onko se väärä
    return res // Aloitetaan vastauksen muodostaminen
      .status(401) // Asetetaan HTTP-statuskoodi 401 (ei valtuutettu)
      .json({ error: "Virheellinen tai puuttuva API-avain" }); // Hylätään pyyntö 401-statuksella
  } // If-lohkon loppu
  next(); // Jos avain täsmää, jatketaan varsinaiseen reittiin
} // Funktion loppu

// Yksinkertainen terveystarkistus
app.get("/health", (req, res) => { // GET-reitti osoitteeseen /health
  res.json({ status: "ok" }); // Vastataan pienellä JSON-oliolla
}); // Reitin määrittely päättyy

// ESP32 lähettää tähän uuden mittauksen — SUOJATTU API-avaimella
app.post(
  "/measurements",
  checkApiKey, // checkApiKey ajetaan ENNEN varsinaista käsittelijää
  asyncHandler(
    async (req, res) => { // Varsinainen mittauksen tallennuslogiikka
      const { deviceId, temperature, status, measuredAt } = req.body; // Poimitaan kentät pyynnön rungosta

      if (!deviceId || !status || !measuredAt) { // Tarkistetaan pakolliset kentät
        return res.status(400).json({ // Vastataan 400-statuksella puuttuvista kentistä
          error: "Puuttuvia kenttiä: deviceId, status ja measuredAt vaaditaan", // Virheviesti kutsujalle
        }); // JSON-vastauksen loppu
      } // If-lohkon loppu

      const saved = await saveMeasurement({ // Kutsutaan tallennusfunktiota
        deviceId, // Laitteen tunniste
        temperature, // Mitattu lämpötila
        status, // Laitteen tilatieto
        measuredAt, // Mittauksen ajanhetki
      }); // Tallennetaan tietokantaan

      if (!saved) { // Jos null, tallennus ohitettiin koska duplikaatti
        return res // Aloitetaan vastauksen muodostaminen
          .status(200) // Duplikaatti ei ole virhe, joten statuskoodi on 200
          .json({ message: "Mittaus oli jo tallennettu (duplikaatti ohitettu)" }); // Kerrotaan syy kutsujalle
      } // If-lohkon loppu

      res.status(201).json({ message: "Mittaus tallennettu", data: saved }); // Onnistumisvastaus
    },
    "Virhe mittauksen tallennuksessa:", // Lokiviesti virhetilanteessa
    "Mittauksen tallennus epäonnistui", // Vastausviesti kutsujalle virhetilanteessa
  ),
); // Reitin määrittely päättyy

// Dashboard hakee tästä laitteen historiadatan — EI suojattu (julkista lukudataa)
app.get(
  "/measurements/:deviceId",
  asyncHandler(
    async (req, res) => { // Varsinainen mittausten hakulogiikka
      const { deviceId } = req.params; // Poimitaan laitteen tunniste osoitteesta
      const hours = parseHours(req.query.hours, 24); // Luetaan ja rajataan tuntimäärä query-parametrista, oletus 24

      const measurements = await getRecentMeasurements(deviceId, hours); // Haetaan mittaukset tietokannasta
      res.json({ deviceId, hours, count: measurements.length, measurements }); // Palautetaan data metatietojen kanssa
    },
    "Virhe mittausten hakemisessa:", // Lokiviesti virhetilanteessa
    "Mittausten hakeminen epäonnistui", // Vastausviesti kutsujalle virhetilanteessa
  ),
); // Reitin määrittely päättyy

// Dashboard hakee tästä laitteen perustiedot — EI suojattu
app.get(
  "/devices/:deviceId",
  asyncHandler(
    async (req, res) => { // Varsinainen laitetietojen hakulogiikka
      const { deviceId } = req.params; // Poimitaan laitteen tunniste osoitteesta
      const device = await getDevice(deviceId); // Haetaan laite tietokannasta

      if (!device) { // Jos laitetta ei löytynyt
        return res.status(404).json({ error: "Laitetta ei löytynyt" }); // Vastataan 404-statuksella
      } // If-lohkon loppu
      res.json(device); // Palautetaan laitteen tiedot
    },
    "Virhe laitetietojen hakemisessa:", // Lokiviesti virhetilanteessa
    "Laitetietojen hakeminen epäonnistui", // Vastausviesti kutsujalle virhetilanteessa
  ),
); // Reitin määrittely päättyy

app.get(
  "/weather", // GET-reitti sääennusteelle
  asyncHandler(
    async (req, res) => { // Varsinainen sääennusteiden hakulogiikka
      const pastHours = parseHours(req.query.pastHours, 24); // Luetaan ja rajataan menneen aikavälin tunnit, oletus 24
      const futureHours = parseHours(req.query.futureHours, 12); // Luetaan ja rajataan tulevan aikavälin tunnit, oletus 12
      const forecasts = await getWeatherForecasts(pastHours, futureHours); // Haetaan ennusteet tietokannasta
      res.json({ pastHours, futureHours, count: forecasts.length, forecasts }); // Palautetaan data metatietojen kanssa
    },
    "Virhe sääennusteen haussa:", // Lokiviesti virhetilanteessa
    "Sääennusteen hakeminen epäonnistui", // Vastausviesti kutsujalle virhetilanteessa
  ),
); // Reitin määrittely päättyy

app.listen(PORT, () => { // Käynnistetään palvelin annetussa portissa
  console.log(`Backend käynnissä portissa ${PORT}`); // Lokitetaan käynnistysviesti
}); // Palvelimen käynnistys päättyy
