require('dotenv').config();          // Luetaan .env-tiedosto ja asetetaan sen arvot process.env-muuttujiin (vain paikallisesti, Render tekee tämän automaattisesti itse)

const { Pool } = require('pg');      // Tuodaan Pool-luokka pg-kirjastosta (Pool = yhteyksien uudelleenkäyttöä hoitava olio)

const pool = new Pool({              // Luodaan yhteyspooli, joka hoitaa yhteydet tietokantaan tehokkaasti
  connectionString: process.env.DATABASE_URL,  // Luetaan yhteysmerkkijono ympäristömuuttujasta (EI koodiin kovakoodattuna)
});

// Tallentaa uuden mittauksen tietokantaan
async function saveMeasurement({ deviceId, temperature, status, measuredAt }) { // Ottaa olion mittauksen tiedoilla
  const result = await pool.query(                          // Suoritetaan SQL-kysely ja odotetaan vastausta
    `INSERT INTO measurements (device_id, temperature, status, measured_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, measured_at) DO NOTHING
     RETURNING *`,                                           // $1, $2, jne. ovat parametripaikkoja (estävät SQL-injektiota)
    [deviceId, temperature, status, measuredAt]               // Annetaan parametrien oikeat arvot tässä järjestyksessä
  );
  return result.rows[0] || null; ;                                      // Palautetaan lisätty rivi (RETURNING * antaa sen takaisin)
}

// Hakee laitteen viimeisimmät mittaukset annetulta aikaväliltä
async function getRecentMeasurements(deviceId, hours = 24) {  // Ottaa laitteen tunnisteen ja tarkasteluvälin tunteina
  const result = await pool.query(                            // Suoritetaan SQL-kysely
    `SELECT * FROM measurements
     WHERE device_id = $1
       AND measured_at >= NOW() - INTERVAL '1 hour' * $2
     ORDER BY measured_at ASC`,                                 // INTERVAL-laskenta tehdään suoraan PostgreSQL:ssä
    [deviceId, hours]                                           // Parametrit kyselyyn
  );
  return result.rows;                                           // Palautetaan kaikki löytyneet rivit listana
}

// Hakee yhden laitteen perustiedot
async function getDevice(deviceId) {                           // Ottaa laitteen tunnisteen parametrina
  const result = await pool.query(                              // Suoritetaan SQL-kysely
    `SELECT * FROM devices WHERE device_id = $1`,                // Yksinkertainen hakukysely device_id:n perusteella
    [deviceId]                                                   // Parametri kyselyyn
  );
  return result.rows[0] || null;                                 // Palautetaan ensimmäinen rivi, tai null jos ei löytynyt
}

module.exports = { saveMeasurement, getRecentMeasurements, getDevice }; // Viedään funktiot server.js:n käytettäväksi