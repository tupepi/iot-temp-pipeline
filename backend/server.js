const express = require('express');

const app = express();                  // Luodaan Express-sovellusolio
const PORT = 3000;                      // Portti, jota palvelin kuuntelee paikallisesti

app.get('/health', (req, res) => {      // Määritellään yksinkertainen reitti osoitteeseen /health
  res.json({ status: 'ok' });            // Vastataan pienellä JSON-oliolla
});

app.listen(PORT, () => {                // Käynnistetään palvelin kuuntelemaan porttia
  console.log(`Palvelin käynnissä: http://localhost:${PORT}`); // Tulostetaan vahvistus terminaaliin
});