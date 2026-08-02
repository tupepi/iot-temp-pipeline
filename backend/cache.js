// In-memory korvike database.js:lle — säilyttää dataa vain prosessin muistissa (EI pysyvää tallennusta).
// Käytössä väliaikaisesti niin kauan kuin tietokantayhteys on pois käytöstä.
// database.js pysyy koskemattomana rinnalla, jotta tietokannan voi kytkeä myöhemmin takaisin vaihtamalla importit.

const MEASUREMENT_RETENTION_MS = 24 * 60 * 60 * 1000; // Mittausten säilytysaika per laite: korkeintaan 24h
const FORECAST_PAST_RETENTION_MS = 24 * 60 * 60 * 1000; // Menneiden ennustepisteiden säilytysaika: sama ikkuna kuin GET /weather:n oletus pastHours=24

const measurementsByDevice = new Map(); // deviceId -> [{id, device_id, temperature, status, measured_at}]
let nextMeasurementId = 1; // Synteettinen juokseva id, korvaa tietokannan serial-sarakkeen

const forecasts = new Map(); // forecast_time (ISO-string) -> {forecast_time, temperature, symbol_code}

// Karsii annetusta mittauslistasta yli 24h vanhat pisteet pois
function pruneMeasurements(list) {
  // Ottaa yhden laitteen mittaustaulukon
  const cutoff = Date.now() - MEASUREMENT_RETENTION_MS; // Vanhin sallittu ajanhetki millisekunteina
  return list.filter((m) => new Date(m.measured_at).getTime() >= cutoff); // Vain säilytysajan sisällä olevat jäävät
} // Funktion loppu

// Tallentaa uuden mittauksen muistiin
// Ottaa olion mittauksen tiedoilla, palauttaa null jos duplikaatti (sama deviceId+measuredAt jo olemassa) — replikoi tietokannan ON CONFLICT DO NOTHING
function saveMeasurement({ deviceId, temperature, status, measuredAt }) {
  // Puretaan mittausolion kentät parametreiksi
  const existing = measurementsByDevice.get(deviceId) ?? []; // Haetaan laitteen nykyinen mittaustaulukko, tai tyhjä jos ei vielä ole
  const isDuplicate = existing.some((m) => m.measured_at === measuredAt); // Sama ajanhetki jo tallennettu?
  if (isDuplicate) return null; // Duplikaatti ohitetaan hiljaa, kuten tietokannassa ennenkin

  const row = {
    // Uusi mittausrivi, muotoiltu samoin kuin pg palauttaisi sen (temperature stringinä)
    id: nextMeasurementId++, // Juokseva synteettinen id
    device_id: deviceId, // Laitteen tunniste
    temperature: String(temperature), // Pidetään stringinä, kuten Postgres NUMERIC serialisoituisi
    status, // Laitteen tilatieto
    measured_at: measuredAt, // Mittauksen ajanhetki
  }; // Rivin määrittely päättyy

  const pruned = pruneMeasurements(existing); // Karsitaan vanhat pisteet ennen uuden lisäämistä
  pruned.push(row); // Lisätään uusi mittaus karsittuun taulukkoon
  measurementsByDevice.set(deviceId, pruned); // Tallennetaan päivitetty taulukko takaisin muistiin
  return row; // Palautetaan lisätty rivi, kuten RETURNING * antaisi
} // Funktion loppu

// Hakee laitteen viimeisimmät mittaukset annetulta aikaväliltä
// Ottaa laitteen tunnisteen ja tarkasteluvälin tunteina — cache ei koskaan sisällä enempää kuin 24h, joten suurempi pyyntö palauttaa vain sen mitä on muistissa
function getRecentMeasurements(deviceId, hours = 24) {
  // hours oletuksena 24 tuntia
  const list = measurementsByDevice.get(deviceId) ?? []; // Haetaan laitteen mittaustaulukko, tai tyhjä jos ei löydy
  const cutoff = Date.now() - hours * 60 * 60 * 1000; // Aikaraja millisekunteina
  return list
    .filter((m) => new Date(m.measured_at).getTime() >= cutoff) // Vain valitun ikkunan sisällä olevat
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at)); // Vanhimmasta uusimpaan, kuten tietokantakysely
} // Funktion loppu

// Karsii ennustekartasta yli 24h vanhat (menneisyydessä olevat) pisteet pois
function pruneForecasts() {
  // Ei ota parametreja, muokkaa suoraan moduulin forecasts-karttaa
  const cutoff = Date.now() - FORECAST_PAST_RETENTION_MS; // Vanhin sallittu ajanhetki millisekunteina
  for (const [key, value] of forecasts) {
    // Käydään läpi kaikki tallennetut ennustepisteet
    if (new Date(value.forecast_time).getTime() < cutoff) forecasts.delete(key); // Poistetaan liian vanhat
  } // Silmukan loppu
} // Funktion loppu

// Tallentaa yhden sääennustepisteen, tai päivittää sen jos ajanhetki on jo olemassa
// Ottaa ennusteen ajanhetken, lämpötilan ja sääsymbolin — sama semantiikka kuin tietokannan ON CONFLICT (forecast_time) DO UPDATE
function saveWeatherForecast(forecastTime, temperature, symbolCode) {
  // Parametrit yhdelle ennustepisteelle
  forecasts.set(forecastTime, {
    // Upsert: sama avain korvaa vanhan arvon
    forecast_time: forecastTime, // Ennusteen ajanhetki
    temperature, // Lämpötila celsiusasteina
    symbol_code: symbolCode, // Sääsymboli, tai null
  }); // set-kutsun loppu
} // Funktion loppu

// Tallentaa taulukollisen ennustepisteitä yhdellä kutsulla — POST /weather -reitin käyttämä
// Ottaa taulukon {forecastTime, temperature, symbolCode} -olioita
function saveWeatherForecastBatch(forecastPoints) {
  // Käydään läpi kaikki annetut pisteet
  for (const point of forecastPoints) {
    // Yksi ennustepiste kerrallaan
    saveWeatherForecast(point.forecastTime, point.temperature, point.symbolCode); // Tallennetaan/päivitetään piste
  } // Silmukan loppu
  pruneForecasts(); // Karsitaan vanhat pisteet erän tallennuksen jälkeen
} // Funktion loppu

// Hakee sääennusteet annetulta aika-alueelta
// Ottaa menneen ja tulevan aikavälin tunteina (oletukset 24h ja 12h)
function getWeatherForecasts(pastHours = 24, futureHours = 12) {
  // Määritellään oletusarvot parametreille
  const now = Date.now(); // Nykyinen ajanhetki millisekunteina
  const from = now - pastHours * 60 * 60 * 1000; // Aikavälin alaraja
  const to = now + futureHours * 60 * 60 * 1000; // Aikavälin yläraja
  return Array.from(forecasts.values())
    .filter((f) => {
      // Rajataan annettuun aikaväliin
      const t = new Date(f.forecast_time).getTime(); // Pisteen ajanhetki millisekunteina
      return t >= from && t <= to; // Vain aikavälin sisällä olevat
    })
    .sort((a, b) => new Date(a.forecast_time) - new Date(b.forecast_time)); // Järjestetään ajan mukaan nousevasti
} // Funktion loppu

module.exports = {
  // Viedään moduulin funktiot
  saveMeasurement, // Mittauksen tallennusfunktio
  getRecentMeasurements, // Mittausten hakufunktio
  saveWeatherForecast, // Sääennusteen tallennusfunktio
  saveWeatherForecastBatch, // Sääennusteiden erätallennusfunktio
  getWeatherForecasts, // Sääennusteiden hakufunktio
}; // Viedään funktiot server.js:n ja weather-fetcher.js:n käytettäväksi
