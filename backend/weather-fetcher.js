require("dotenv").config(); // Ladataan .env paikallista ajoa varten
const { Pool } = require("pg"); // Tietokantayhteys

const pool = new Pool({
  // Sama yhteys kuin database.js:ssä
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

// Jyväskylän koordinaatit
const LAT = 62.225039; // Leveysaste
const LON = 25.722706; // Pituusaste
const USER_AGENT = "iot-temp-pipeline/1.0 tuukkapitkanen2@gmail.com"; // Vaihda oma sähköposti tähän

async function fetchAndSaveWeather() {
  console.log("Haetaan säätietoja Yr.no:lta...");

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT, // Yr.no vaatii tämän, muuten 403
    },
  });

  if (!response.ok) {
    // Tarkistetaan onnistuiko pyyntö
    throw new Error(`Yr.no vastasi: ${response.status}`);
  }

  const data = await response.json(); // Muutetaan vastaus JSON-olioksi

  // Yr.no palauttaa ennusteet timeseries-taulukossa
  // Jokainen alkio on yksi ajanhetki ennusteineen
  const timeseries = data.properties.timeseries;

  // Tallennetaan seuraavat 48h ennusteet (Yr.no antaa usein pidemmänkin ennusteen)
  const now = new Date();
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h eteenpäin

  const relevantForecasts = timeseries.filter((entry) => {
    const forecastTime = new Date(entry.time);
    return forecastTime >= now && forecastTime <= cutoff; // Vain tulevat 48h
  });

  console.log(`Tallennetaan ${relevantForecasts.length} ennustepistettä...`);

  for (const entry of relevantForecasts) {
    const forecastTime = entry.time; // ISO-muotoinen aikaleima
    const temperature = entry.data.instant.details.air_temperature; // Lämpötila celsiusasteina
    const symbolCode =
      entry.data.next_1_hours?.summary?.symbol_code ?? // Sääsymboli seuraavalle tunnille
      entry.data.next_6_hours?.summary?.symbol_code ?? // Jos ei ole 1h, otetaan 6h
      null; // Jos ei kumpaakaan, null

    await pool.query(
      `INSERT INTO weather_forecasts (forecast_time, temperature, symbol_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (forecast_time)
       DO UPDATE SET                                           
         temperature = EXCLUDED.temperature,
         symbol_code = EXCLUDED.symbol_code,
         fetched_at = now()`, // Päivitetään olemassaoleva rivi uudemmalla ennusteella
      [forecastTime, temperature, symbolCode],
    );
  }

  console.log("Säätiedot tallennettu.");
  await pool.end(); // Suljetaan tietokantayhteys siististi
}

fetchAndSaveWeather() // Ajetaan heti kun skripti käynnistyy
  .then(() => process.exit(0)) // Onnistui — sammutetaan prosessi
  .catch((err) => {
    // Epäonnistui...
    console.error("Virhe säätietojen haussa:", err); // ...lokitetaan virhe
    process.exit(1); // ...sammutetaan prosessi virhekoodilla
  });
