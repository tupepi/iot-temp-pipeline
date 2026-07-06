const { saveWeatherForecast, closePool } = require("./database"); // Tuodaan tietokantafunktiot samasta DB-kerroksesta kuin server.js käyttää

// Jyväskylän koordinaatit
const LAT = 62.225039; // Leveysaste
const LON = 25.722706; // Pituusaste
const USER_AGENT = "iot-temp-pipeline/1.0 tuukkapitkanen2@gmail.com"; // Vaihda oma sähköposti tähän

async function fetchAndSaveWeather() { // Hakee ja tallentaa Yr.no:n sääennusteet
  console.log("Haetaan säätietoja Yr.no:lta..."); // Lokitetaan haun aloitus

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`; // Rakennetaan API-osoite koordinaateilla

  const response = await fetch(url, { // Tehdään HTTP-pyyntö Yr.no:n rajapintaan
    headers: {
      "User-Agent": USER_AGENT, // Yr.no vaatii tämän, muuten 403
    }, // headers-olion loppu
  }); // fetch-kutsun loppu

  if (!response.ok) { // Tarkistetaan onnistuiko pyyntö
    // Tarkistetaan onnistuiko pyyntö
    throw new Error(`Yr.no vastasi: ${response.status}`); // Keskeytetään virheellisellä vastauksella
  } // If-lohkon loppu

  const data = await response.json(); // Muutetaan vastaus JSON-olioksi

  // Yr.no palauttaa ennusteet timeseries-taulukossa
  // Jokainen alkio on yksi ajanhetki ennusteineen
  const timeseries = data.properties.timeseries; // Poimitaan ennustetaulukko vastauksesta

  // Tallennetaan seuraavat 48h ennusteet (Yr.no antaa usein pidemmänkin ennusteen)
  const now = new Date(); // Nykyinen ajanhetki
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h eteenpäin

  const relevantForecasts = timeseries.filter((entry) => { // Suodatetaan vain relevantit ennusteet
    const forecastTime = new Date(entry.time); // Muutetaan ennusteen aikaleima Date-olioksi
    return forecastTime >= now && forecastTime <= cutoff; // Vain tulevat 48h
  }); // Filter-kutsun loppu

  console.log(`Tallennetaan ${relevantForecasts.length} ennustepistettä...`); // Lokitetaan tallennettavien määrä

  for (const entry of relevantForecasts) { // Käydään läpi kaikki relevantit ennusteet
    const forecastTime = entry.time; // ISO-muotoinen aikaleima
    const temperature = entry.data.instant.details.air_temperature; // Lämpötila celsiusasteina
    const symbolCode =
      entry.data.next_1_hours?.summary?.symbol_code ?? // Sääsymboli seuraavalle tunnille
      entry.data.next_6_hours?.summary?.symbol_code ?? // Jos ei ole 1h, otetaan 6h
      null; // Jos ei kumpaakaan, null

    await saveWeatherForecast(forecastTime, temperature, symbolCode); // Tallennetaan ennuste database.js:n kautta
  } // For-silmukan loppu

  console.log("Säätiedot tallennettu."); // Lokitetaan onnistunut tallennus
  await closePool(); // Suljetaan tietokantayhteys siististi
} // Funktion loppu

fetchAndSaveWeather() // Ajetaan heti kun skripti käynnistyy
  .then(() => process.exit(0)) // Onnistui — sammutetaan prosessi
  .catch((err) => { // Epäonnistui...
    // Epäonnistui...
    console.error("Virhe säätietojen haussa:", err); // ...lokitetaan virhe
    process.exit(1); // ...sammutetaan prosessi virhekoodilla
  }); // Catch-lohkon loppu
