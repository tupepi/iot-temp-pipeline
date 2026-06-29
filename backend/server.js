const express = require('express');                          // Tuodaan Express-kirjasto
const { saveMeasurement, getRecentMeasurements, getDevice } = require('./database'); // Tuodaan tietokantafunktiot

const app = express();                                        // Luodaan Express-sovellusolio
const cors = require('cors');
const PORT = process.env.PORT || 3000;                        // Render asettaa PORT-muuttujan automaattisesti

app.use(cors());
app.use(express.json());                                      // Otetaan käyttöön JSON-rungon automaattinen jäsennys

// Middleware: tarkistaa että pyynnössä on oikea API-avain
function checkApiKey(req, res, next) {                         // Funktio, joka ajetaan ennen suojattua reittiä
  const apiKey = req.headers['x-api-key'];                      // Luetaan avain pyynnön omasta otsikosta (header)
  if (!apiKey || apiKey !== process.env.DEVICE_API_KEY) {        // Tarkistetaan puuttuuko avain TAI onko se väärä
    return res.status(401).json({ error: 'Virheellinen tai puuttuva API-avain' }); // Hylätään pyyntö 401-statuksella
  }
  next();                                                        // Jos avain täsmää, jatketaan varsinaiseen reittiin
}

// Yksinkertainen terveystarkistus
app.get('/health', (req, res) => {                             // GET-reitti osoitteeseen /health
  res.json({ status: 'ok' });                                   // Vastataan pienellä JSON-oliolla
});

// ESP32 lähettää tähän uuden mittauksen — SUOJATTU API-avaimella
app.post('/measurements', checkApiKey, async (req, res) => {   // checkApiKey ajetaan ENNEN varsinaista käsittelijää
  try {                                                          // Aloitetaan virheenkäsittelylohko
    const { deviceId, temperature, status, measuredAt } = req.body; // Poimitaan kentät pyynnön rungosta

    if (!deviceId || !status || !measuredAt) {                   // Tarkistetaan pakolliset kentät
      return res.status(400).json({ error: 'Puuttuvia kenttiä: deviceId, status ja measuredAt vaaditaan' });
    }

    const saved = await saveMeasurement({ deviceId, temperature, status, measuredAt }); // Tallennetaan tietokantaan
    res.status(201).json({ message: 'Mittaus tallennettu', data: saved }); // Onnistumisvastaus
  } catch (error) {                                             // Jos jokin menee pieleen...
    console.error('Virhe mittauksen tallennuksessa:', error);     // ...lokitetaan koko virhe-olio (opittu aiemmasta!)
    res.status(500).json({ error: 'Mittauksen tallennus epäonnistui' });
  }
});

// Dashboard hakee tästä laitteen historiadatan — EI suojattu (julkista lukudataa)
app.get('/measurements/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const hours = parseInt(req.query.hours) || 24;

    const measurements = await getRecentMeasurements(deviceId, hours);
    res.json({ deviceId, hours, count: measurements.length, measurements });
  } catch (error) {
    console.error('Virhe mittausten hakemisessa:', error);
    res.status(500).json({ error: 'Mittausten hakeminen epäonnistui' });
  }
});

// Dashboard hakee tästä laitteen perustiedot — EI suojattu
app.get('/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await getDevice(deviceId);

    if (!device) {
      return res.status(404).json({ error: 'Laitetta ei löytynyt' });
    }
    res.json(device);
  } catch (error) {
    console.error('Virhe laitetietojen hakemisessa:', error);
    res.status(500).json({ error: 'Laitetietojen hakeminen epäonnistui' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend käynnissä portissa ${PORT}`);
});