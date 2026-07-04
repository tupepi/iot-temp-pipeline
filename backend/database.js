require("dotenv").config(); // Luetaan .env-tiedosto ja asetetaan sen arvot process.env-muuttujiin (vain paikallisesti, Render tekee tämän automaattisesti itse)

const { Pool } = require("pg"); // Tuodaan Pool-luokka pg-kirjastosta (Pool = yhteyksien uudelleenkäyttöä hoitava olio)

// Luodaan yhteyspooli, joka hoitaa yhteydet tietokantaan tehokkaasti
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Luetaan yhteysmerkkijono ympäristömuuttujasta (EI koodiin kovakoodattuna)
});

const cache = {
  data: null,
  timestamp: 0,
  TTL: 5 * 60 * 1000, // 5 minuuttia millisekunteina
};

// Tallentaa uuden mittauksen tietokantaan
// Ottaa olion mittauksen tiedoilla
async function saveMeasurement({ deviceId, temperature, status, measuredAt }) {
  const result = await pool.query(
    // Suoritetaan SQL-kysely ja odotetaan vastausta
    `INSERT INTO measurements (device_id, temperature, status, measured_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, measured_at) DO NOTHING
     RETURNING *`, // $1, $2, jne. ovat parametripaikkoja (estävät SQL-injektiota)
    [deviceId, temperature, status, measuredAt], // Annetaan parametrien oikeat arvot tässä järjestyksessä
  );
  cache.data = null; // Tyhjennetään välimuisti uuden mittauksen jälkeen
  cache.timestamp = 0;
  return result.rows[0] || null; // Palautetaan lisätty rivi (RETURNING * antaa sen takaisin)
}

// Hakee laitteen viimeisimmät mittaukset annetulta aikaväliltä
// Ottaa laitteen tunnisteen ja tarkasteluvälin tunteina
async function getRecentMeasurements(deviceId, hours = 24) {
  const now = Date.now();

  if (cache.data && now - cache.timestamp < cache.TTL) {
    console.log("Palautetaan välimuistista");
    return cache.data;
  }

  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM measurements
     WHERE device_id = $1
       AND measured_at >= NOW() - INTERVAL '1 hour' * $2
     ORDER BY measured_at ASC`, // INTERVAL-laskenta tehdään suoraan PostgreSQL:ssä
    [deviceId, hours], // Parametrit kyselyyn
  );
  rcache.data = result.rows;
  cache.timestamp = now;
  return cache.data; // Palautetaan kaikki löytyneet rivit listana
}

// Hakee yhden laitteen perustiedot
// Ottaa laitteen tunnisteen parametrina
async function getDevice(deviceId) {
  const result = await pool.query(
    // Suoritetaan SQL-kysely
    `SELECT * FROM devices WHERE device_id = $1`, // Yksinkertainen hakukysely device_id:n perusteella
    [deviceId], // Parametri kyselyyn
  );
  return result.rows[0] || null; // Palautetaan ensimmäinen rivi, tai null jos ei löytynyt
}

module.exports = { saveMeasurement, getRecentMeasurements, getDevice }; // Viedään funktiot server.js:n käytettäväksi
