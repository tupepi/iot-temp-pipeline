require("dotenv").config(); // Luetaan .env-tiedosto ja asetetaan sen arvot process.env-muuttujiin (vain paikallisesti, Render tekee tämän automaattisesti itse)

const { Pool } = require("pg"); // Tuodaan Pool-luokka pg-kirjastosta (Pool = yhteyksien uudelleenkäyttöä hoitava olio)

// Luodaan yhteyspooli, joka hoitaa yhteydet tietokantaan tehokkaasti
const pool = new Pool({
  // Määritellään poolin asetukset
  connectionString: process.env.DATABASE_URL, // Luetaan yhteysmerkkijono ympäristömuuttujasta (EI koodiin kovakoodattuna)
  ssl: {
    // SSL-asetukset tietokantayhteydelle
    rejectUnauthorized: true, // Varmistetaan palvelimen varmenne (verify-full -käytös)
  }, // SSL-asetusten loppu
}); // Poolin määrittely päättyy

const cache = new Map(); // Välimuisti mittausten hakua varten, avaimena "deviceId:hours"
const CACHE_TTL = 5 * 60 * 1000; // Välimuistin voimassaoloaika millisekunteina (5 minuuttia)

// Tallentaa uuden mittauksen tietokantaan
// Ottaa olion mittauksen tiedoilla
async function saveMeasurement({ deviceId, temperature, status, measuredAt }) {
  // Puretaan mittausolion kentät parametreiksi
  const result = await pool.query(
    // Suoritetaan SQL-kysely ja odotetaan vastausta
    `INSERT INTO measurements (device_id, temperature, status, measured_at) -- Lisätään uusi rivi measurements-tauluun
     VALUES ($1, $2, $3, $4) -- Arvot annetaan parametreina
     ON CONFLICT (device_id, measured_at) DO NOTHING -- Ei virhettä jos rivi on jo olemassa
     RETURNING *`, // $1, $2, jne. ovat parametripaikkoja (estävät SQL-injektiota)
    [deviceId, temperature, status, measuredAt], // Annetaan parametrien oikeat arvot tässä järjestyksessä
  ); // Kyselyn kutsu päättyy
  for (const key of cache.keys()) {
    // Käydään läpi kaikki välimuistiavaimet
    if (key.startsWith(`${deviceId}:`)) cache.delete(key); // Tyhjennetään vain tämän laitteen välimuisti
  } // Silmukan loppu
  return result.rows[0] || null; // Palautetaan lisätty rivi (RETURNING * antaa sen takaisin)
} // Funktion loppu

// Hakee laitteen viimeisimmät mittaukset annetulta aikaväliltä
// Ottaa laitteen tunnisteen ja tarkasteluvälin tunteina
async function getRecentMeasurements(deviceId, hours = 24) {
  // hours oletuksena 24 tuntia
  const key = `${deviceId}:${hours}`; // Välimuistiavain laitteen ja tuntimäärän mukaan
  const now = Date.now(); // Nykyinen ajanhetki millisekunteina
  const cached = cache.get(key); // Haetaan mahdollinen välimuistissa oleva merkintä

  if (cached && now - cached.timestamp < CACHE_TTL) {
    // Tarkistetaan onko välimuisti vielä voimassa
    console.log("Palautetaan välimuistista"); // Tulostetaan tieto välimuistin käytöstä
    return cached.data; // Palautetaan välimuistissa oleva data
  } // If-lohkon loppu

  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM measurements -- Haetaan kaikki sarakkeet measurements-taulusta
     WHERE device_id = $1 -- Rajataan haluttuun laitteeseen
       AND measured_at >= NOW() - INTERVAL '1 hour' * $2 -- Rajataan aikavälin mukaan
     ORDER BY measured_at ASC`, // INTERVAL-laskenta tehdään suoraan PostgreSQL:ssä
    [deviceId, hours], // Parametrit kyselyyn
  ); // Kyselyn kutsu päättyy
  cache.set(key, { data: result.rows, timestamp: now }); // Tallennetaan tulos välimuistiin avaimella
  return result.rows; // Palautetaan kaikki löytyneet rivit listana
} // Funktion loppu

// Hakee laitteen mittaukset tarkalta, käyttäjän valitsemalta päivämääräväliltä
// Ottaa laitteen tunnisteen sekä alku- ja loppupäivän (YYYY-MM-DD) — ei välimuistia, koska välit ovat mielivaltaisia
async function getMeasurementsInRange(deviceId, from, to) {
  // Historianäkymän haku, erillään getRecentMeasurements-välimuistista
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM measurements -- Haetaan kaikki sarakkeet measurements-taulusta
     WHERE device_id = $1 -- Rajataan haluttuun laitteeseen
       AND measured_at >= $2::date -- Alkupäivän alusta
       AND measured_at < ($3::date + INTERVAL '1 day') -- Loppupäivän loppuun asti
     ORDER BY measured_at ASC`, // Vanhimmasta uusimpaan
    [deviceId, from, to], // Parametrit kyselyyn
  ); // Kyselyn kutsu päättyy
  return result.rows; // Palautetaan kaikki löytyneet rivit listana
} // Funktion loppu

// Hakee laitteen vanhimman tallennetun mittauksen ajanhetken
// Käytetään historiavalitsimen "vanhin sallittu päivämäärä" -rajana
async function getEarliestMeasurementTime(deviceId) {
  // Ottaa laitteen tunnisteen parametrina
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT MIN(measured_at) AS earliest FROM measurements WHERE device_id = $1`, // Etsitään vanhin aikaleima
    [deviceId], // Parametri kyselyyn
  ); // Kyselyn kutsu päättyy
  return result.rows[0]?.earliest ?? null; // Palautetaan aikaleima, tai null jos mittauksia ei ole
} // Funktion loppu

// Hakee yhden laitteen perustiedot
// Ottaa laitteen tunnisteen parametrina
async function getDevice(deviceId) {
  // Haetaan laite annetulla tunnisteella
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM devices WHERE device_id = $1`, // Yksinkertainen hakukysely device_id:n perusteella
    [deviceId], // Parametri kyselyyn
  ); // Kyselyn kutsu päättyy
  return result.rows[0] || null; // Palautetaan ensimmäinen rivi, tai null jos ei löytynyt
} // Funktion loppu

// Hakee sääennusteet annetulta aika-alueelta
// Ottaa menneen ja tulevan aikavälin tunteina (oletukset 24h ja 12h)
async function getWeatherForecasts(pastHours = 24, futureHours = 12) {
  // Määritellään oletusarvot parametreille
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT forecast_time, temperature, symbol_code -- Valitaan tarvittavat sarakkeet
     FROM weather_forecasts -- Haetaan weather_forecasts-taulusta
     WHERE forecast_time >= NOW() - INTERVAL '1 hour' * $1   -- Vain tulevat ennusteet
       AND forecast_time <= NOW() + INTERVAL '1 hour' * $2    -- Annettu aikaväli
     ORDER BY forecast_time ASC`, // Järjestetään ajan mukaan nousevasti
    [pastHours, futureHours], // Kyselyn parametrit
  ); // Kyselyn kutsu päättyy
  return result.rows; // Palautetaan löytyneet ennusteet
} // Funktion loppu

// Hakee säädatan tarkalta, käyttäjän valitsemalta päivämääräväliltä
// Ottaa alku- ja loppupäivän (YYYY-MM-DD) — ei välimuistia, koska välit ovat mielivaltaisia
async function getWeatherForecastsInRange(from, to) {
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM weather_forecasts -- Haetaan kaikki sarakkeet weather_forecasts-taulusta
     WHERE forecast_time >= $1::date -- Alkupäivän alusta
       AND forecast_time < ($2::date + INTERVAL '1 day') -- Loppupäivän loppuun asti
     ORDER BY forecast_time ASC`, // Vanhimmasta uusimpaan
    [from, to], // Parametrit kyselyyn
  ); // Kyselyn kutsu päättyy
  return result.rows; // Palautetaan kaikki löytyneet rivit listana
} // Funktion loppu

// Tallentaa yhden sääennustepisteen, tai päivittää sen jos ajanhetki on jo olemassa
// Ottaa ennusteen ajanhetken, lämpötilan ja sääsymbolin
async function saveWeatherForecast(forecastTime, temperature, symbolCode) {
  // Parametrit yhdelle ennustepisteelle
  await pool.query(
    // Suoritetaan SQL-kysely
    `INSERT INTO weather_forecasts (forecast_time, temperature, symbol_code) -- Lisätään tai päivitetään ennuste
     VALUES ($1, $2, $3) -- Arvot annetaan parametreina
     ON CONFLICT (forecast_time) -- Jos ennuste samalle ajanhetkelle on jo olemassa
     DO UPDATE SET -- Päivitetään olemassaoleva rivi
       temperature = EXCLUDED.temperature, -- Päivitetään lämpötila uusimmalla ennusteella
       symbol_code = EXCLUDED.symbol_code, -- Päivitetään sääsymboli uusimmalla ennusteella
       fetched_at = now()`, // Päivitetään olemassaoleva rivi uudemmalla ennusteella
    [forecastTime, temperature, symbolCode], // Kyselyn parametrit
  ); // Kyselyn kutsu päättyy
} // Funktion loppu

// Sulkee tietokantayhteyspoolin siististi
// Käytetään kertaluontoisissa skripteissä (esim. weather-fetcher.js) ajon lopuksi
async function closePool() {
  // Ei ota parametreja
  await pool.end(); // Suljetaan kaikki poolin yhteydet
} // Funktion loppu

module.exports = {
  // Viedään moduulin funktiot
  saveMeasurement, // Mittauksen tallennusfunktio
  getRecentMeasurements, // Mittausten hakufunktio
  getMeasurementsInRange, // Mittausten hakufunktio tarkalta päivämääräväliltä
  getEarliestMeasurementTime, // Vanhimman mittauksen ajanhetken hakufunktio
  getDevice, // Laitteen hakufunktio
  getWeatherForecasts, // Sääennusteiden hakufunktio
  saveWeatherForecast, // Sääennusteen tallennusfunktio
  getWeatherForecastsInRange, // Sääennusteiden hakufunktio tarkalta päivämääräväliltä
  closePool, // Poolin sulkemisfunktio
}; // Viedään funktiot server.js:n ja weather-fetcher.js:n käytettäväksi
