const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://iot-temp-pipeline.onrender.com'; // Backendin osoite: ympäristömuuttuja tai tuotanto-oletus

async function fetchJson(url: string) {
  // Yhteinen hakufunktio: tekee GET-pyynnön ja palauttaa JSON-vastauksen
  const response = await fetch(url); // Tehdään GET-pyyntö annettuun osoitteeseen
  if (!response.ok) throw new Error(`Palvelin vastasi: ${response.status}`); // Heitetään virhe epäonnistuneesta pyynnöstä
  return response.json(); // Palautetaan vastaus JSON-oliona
} // Funktion loppu

export async function fetchDevice(deviceId: string) {
  // Hakee laitteen perustiedot
  return fetchJson(`${BACKEND_URL}/devices/${deviceId}`); // Palautetaan laitteen tiedot sellaisenaan
}

export async function fetchMeasurements(deviceId: string, hours: number = 24) {
  // Hakee laitteen mittaukset annetulta aikaväliltä
  const data = await fetchJson(`${BACKEND_URL}/measurements/${deviceId}?hours=${hours}`); // Haetaan mittausvastaus
  return data.measurements; // Palautetaan pelkkä mittaustaulukko
}

export async function fetchWeather(pastHours: number = 24, futureHours: number = 12) {
  // Hakee sääennusteet annetulta aika-alueelta
  const data = await fetchJson(
    `${BACKEND_URL}/weather?pastHours=${pastHours}&futureHours=${futureHours}` // Rakennetaan kysely aikaväliparametrein
  ); // Haetaan ennustevastaus
  return data.forecasts; // Palautetaan pelkkä ennustetaulukko
}
