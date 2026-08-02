// Jyväskylän koordinaatit
const LAT = 62.225039; // Leveysaste
const LON = 25.722706; // Pituusaste
const USER_AGENT = "iot-temp-pipeline/1.0 tuukkapitkanen2@gmail.com"; // Vaihda oma sähköposti tähän

const BACKEND_URL = process.env.BACKEND_URL; // Palvelimen osoite, jonne haettu säädata POSTataan (väliaikaisesti DB:n sijaan)
const DEVICE_API_KEY = process.env.DEVICE_API_KEY; // Sama avain kuin ESP32:n mittauslähetyksillä

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

  const forecastPoints = relevantForecasts.map((entry) => ({ // Muunnetaan Yr.no-datapisteet POST-rungon muotoon
    forecastTime: entry.time, // ISO-muotoinen aikaleima
    temperature: entry.data.instant.details.air_temperature, // Lämpötila celsiusasteina
    symbolCode:
      entry.data.next_1_hours?.summary?.symbol_code ?? // Sääsymboli seuraavalle tunnille
      entry.data.next_6_hours?.summary?.symbol_code ?? // Jos ei ole 1h, otetaan 6h
      null, // Jos ei kumpaakaan, null
  })); // map-kutsun loppu

  console.log(`Lähetetään ${forecastPoints.length} ennustepistettä backendille...`); // Lokitetaan lähetettävien määrä

  const saveResponse = await fetch(`${BACKEND_URL}/weather`, { // Postataan koko erä yhdellä kutsulla, ei yksi pyyntö per piste
    method: "POST", // Kirjoituspyyntö
    headers: {
      "x-api-key": DEVICE_API_KEY, // Sama jaettu avain kuin ESP32:lla
      "Content-Type": "application/json", // Kerrotaan rungon muoto
    }, // headers-olion loppu
    body: JSON.stringify({ forecasts: forecastPoints }), // Rungon sisältö
  }); // fetch-kutsun loppu

  if (!saveResponse.ok) { // Tarkistetaan onnistuiko tallennus
    throw new Error(`Backend vastasi säädatan tallennukseen: ${saveResponse.status}`); // Keskeytetään virheellisellä vastauksella
  } // If-lohkon loppu

  console.log("Säätiedot lähetetty backendille."); // Lokitetaan onnistunut lähetys
} // Funktion loppu

fetchAndSaveWeather() // Ajetaan heti kun skripti käynnistyy
  .then(() => process.exit(0)) // Onnistui — sammutetaan prosessi
  .catch((err) => { // Epäonnistui...
    // Epäonnistui...
    console.error("Virhe säätietojen haussa:", err); // ...lokitetaan virhe
    process.exit(1); // ...sammutetaan prosessi virhekoodilla
  }); // Catch-lohkon loppu
