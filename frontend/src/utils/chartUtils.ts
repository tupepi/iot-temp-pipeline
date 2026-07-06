// Mittauksen tietorakenne — siirretty tänne, jotta sama tyyppi on käytettävissä muuallakin
export interface Measurement {
  // Yksi tietokannasta haettu mittausrivi
  id: number; // Mittauksen tietokantatunniste
  device_id: string; // Laitteen tunniste
  temperature: string; // Neon palauttaa NUMERIC-tyypin merkkijonona
  status: string; // Anturin tilatieto ("OK"/"ERROR")
  measured_at: string; // Mittauksen ISO-aikaleima
}

// Rechartsille sopiva datapiste
export interface ChartPoint {
  // Yksi piste kuvaajan viivalle
  time: string; // Näytetään X-akselilla (esim. "14:30")
  temp: number; // Y-akselin arvo
  timestamp: number; // Unix-aika ms, käytetään laskennassa ja X-akselin tickseissä
}

export interface WeatherForecast {
  // Yksi tietokannasta haettu sääennusterivi
  forecast_time: string; // Ennusteen ISO-aikaleima
  temperature: string; // Ennustettu lämpötila merkkijonona
  symbol_code: string | null; // Sääsymbolin koodi, tai null jos ei saatavilla
}

// Lineaarinen interpolointi: laskee lämpötilan halutulla ajanhetkellä kahden tunnetun pisteen välillä
function interpolateTemperature( // Laskee lämpötilan kahden mittauspisteen välissä
  t1: number, // Aiemman mittauksen ajanhetki (ms)
  y1: number, // Aiempi mittaus: aika (ms) ja lämpötila
  t2: number, // Myöhemmän mittauksen ajanhetki (ms)
  y2: number, // Myöhempi mittaus: aika (ms) ja lämpötila
  t: number // Haluttu ajankohta (ms)
): number {
  // Palauttaa interpoloidun lämpötilan
  return y1 + ((y2 - y1) * (t - t1)) / (t2 - t1); // Lineaarinen interpolointikaava
} // Funktion loppu

// Laskee interpoloidut pisteet tasaminuuteille (0, 10, 20, 30, 40, 50) mittausdatasta
export function buildInterpolatedChartData(measurements: Measurement[]): ChartPoint[] {
  // Interpoloi mittaukset kymmenen minuutin tarkkuudelle
  if (measurements.length < 2) return []; // Interpolointi vaatii vähintään kaksi pistettä

  const points = measurements // Muunnetaan mittaukset laskentaa varten kevyempään muotoon
    .filter((m) => m.status === 'OK') // Jätetään virheelliset mittaukset pois
    .map((m) => ({
      timestamp: new Date(m.measured_at).getTime(), // ISO-aika → millisekunteja
      temp: parseFloat(m.temperature), // Lämpötila numerona
    }));

  if (points.length < 2) return []; // Suodatuksen jälkeen ei ehkä enää riitä pisteitä

  const result: ChartPoint[] = []; // Kerätään interpoloidut pisteet tähän

  // Pyöristetään ensimmäinen ajankohta seuraavaan tasaminuuttiin ylöspäin
  const start = new Date(points[0].timestamp); // Ensimmäisen mittauksen ajanhetki
  start.setSeconds(0, 0); // Nollataan sekunnit ja millisekunnit
  const remainder = start.getMinutes() % 10; // Kuinka monta minuuttia yli tasaminuutin
  if (remainder !== 0) {
    // Jos ei jo valmiiksi tasakymmenellä
    start.setMinutes(start.getMinutes() + (10 - remainder)); // Siirretään seuraavaan tasaminuuttiin
  } // If-lohkon loppu

  const lastTime = new Date(points[points.length - 1].timestamp); // Viimeisimmän mittauksen ajanhetki

  // Käydään läpi jokainen tasaminuutti ensimmäisestä viimeiseen
  const current = new Date(start); // Liikkuva ajanhetki-osoitin silmukkaa varten
  while (current <= lastTime) {
    // Kunnes ollaan käyty koko aikaväli läpi
    const t = current.getTime(); // Nykyisen tasaminuutin ajanhetki millisekunteina

    const afterIndex = points.findIndex((p) => p.timestamp >= t); // Ensimmäinen mittaus joka on t:n jälkeen

    if (afterIndex > 0) {
      // Interpolointi onnistuu vain jos löytyy sekä ennen että jälkeen -piste
      const before = points[afterIndex - 1]; // Lähin mittaus ennen ajanhetkeä t
      const after = points[afterIndex]; // Lähin mittaus ajanhetken t jälkeen

      const interpolated = interpolateTemperature(
        // Lasketaan lämpötila ajanhetkelle t
        before.timestamp,
        before.temp,
        after.timestamp,
        after.temp,
        t
      );

      result.push({
        // Lisätään interpoloitu piste tulosjoukkoon
        timestamp: t, // Tasaminuutin ajanhetki
        temp: parseFloat(interpolated.toFixed(1)), // Pyöristetty lämpötila
        time: current.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }), // Kellonaika X-akselia varten
      });
    } // If-lohkon loppu

    current.setMinutes(current.getMinutes() + 10); // Siirrytään seuraavaan tasaminuuttiin
  } // While-silmukan loppu

  return result; // Palautetaan kaikki interpoloidut pisteet
} // Funktion loppu

// Laskee tilastot (min, max, keskiarvo) interpoloidusta datasta
export function calculateStats(chartData: ChartPoint[]): {
  // Laskee kuvaajan tilastot
  minTemp: string; // Alin lämpötila muotoiltuna
  maxTemp: string; // Ylin lämpötila muotoiltuna
  avgTemp: string; // Keskilämpötila muotoiltuna
} {
  if (chartData.length === 0) return { minTemp: '-', maxTemp: '-', avgTemp: '-' }; // Ei dataa: näytetään viivat

  const temps = chartData.map((p) => p.temp); // Poimitaan pelkät lämpötila-arvot
  return {
    // Palautetaan valmiiksi muotoillut tilastot
    minTemp: Math.min(...temps).toFixed(1), // Alin arvo yhden desimaalin tarkkuudella
    maxTemp: Math.max(...temps).toFixed(1), // Ylin arvo yhden desimaalin tarkkuudella
    avgTemp: (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1), // Keskiarvo yhden desimaalin tarkkuudella
  };
} // Funktion loppu

export function getTimeAgo(isoString: string): string {
  // Muotoilee "X min/h sitten" -tekstin aikaleimasta
  const diff = Date.now() - new Date(isoString).getTime(); // Erotus millisekunteina
  const minutes = Math.floor(diff / 60000); // Muutetaan minuuteiksi

  if (minutes < 1) return 'juuri nyt'; // Alle minuutti sitten
  if (minutes === 1) return '1 min sitten'; // Tasan yksi minuutti sitten
  if (minutes < 60) return `${minutes} min sitten`; // Alle tunti sitten

  const hours = Math.floor(minutes / 60); // Muutetaan tunneiksi
  if (hours === 1) return '1 h sitten'; // Tasan yksi tunti sitten
  return `${hours} h sitten`; // Useampi tunti sitten
} // Funktion loppu
