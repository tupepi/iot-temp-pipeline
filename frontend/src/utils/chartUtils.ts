// Mittauksen tietorakenne — siirretty tänne, jotta sama tyyppi on käytettävissä muuallakin
export interface Measurement {
  id: number;
  device_id: string;
  temperature: string; // Neon palauttaa NUMERIC-tyypin merkkijonona
  status: string;
  measured_at: string;
}

// Rechartsille sopiva datapiste
export interface ChartPoint {
  time: string; // Näytetään X-akselilla (esim. "14:30")
  temp: number; // Y-akselin arvo
  timestamp: number; // Unix-aika ms, käytetään laskennassa ja X-akselin tickseissä
}

export interface WeatherForecast {
  forecast_time: string;
  temperature: string;
  symbol_code: string | null;
}

// Lineaarinen interpolointi: laskee lämpötilan halutulla ajanhetkellä kahden tunnetun pisteen välillä
function interpolateTemperature(
  t1: number,
  y1: number, // Aiempi mittaus: aika (ms) ja lämpötila
  t2: number,
  y2: number, // Myöhempi mittaus: aika (ms) ja lämpötila
  t: number // Haluttu ajankohta (ms)
): number {
  return y1 + ((y2 - y1) * (t - t1)) / (t2 - t1); // Lineaarinen interpolointikaava
}

// Laskee interpoloidut pisteet tasaminuuteille (0, 10, 20, 30, 40, 50) mittausdatasta
export function buildInterpolatedChartData(measurements: Measurement[]): ChartPoint[] {
  if (measurements.length < 2) return []; // Interpolointi vaatii vähintään kaksi pistettä

  const points = measurements
    .filter((m) => m.status === 'OK') // Jätetään virheelliset mittaukset pois
    .map((m) => ({
      timestamp: new Date(m.measured_at).getTime(), // ISO-aika → millisekunteja
      temp: parseFloat(m.temperature),
    }));

  if (points.length < 2) return [];

  const result: ChartPoint[] = [];

  // Pyöristetään ensimmäinen ajankohta seuraavaan tasaminuuttiin ylöspäin
  const start = new Date(points[0].timestamp);
  start.setSeconds(0, 0); // Nollataan sekunnit ja millisekunnit
  const remainder = start.getMinutes() % 10; // Kuinka monta minuuttia yli tasaminuutin
  if (remainder !== 0) {
    start.setMinutes(start.getMinutes() + (10 - remainder)); // Siirretään seuraavaan tasaminuuttiin
  }

  const lastTime = new Date(points[points.length - 1].timestamp);

  // Käydään läpi jokainen tasaminuutti ensimmäisestä viimeiseen
  const current = new Date(start);
  while (current <= lastTime) {
    const t = current.getTime();

    const afterIndex = points.findIndex((p) => p.timestamp >= t); // Ensimmäinen mittaus joka on t:n jälkeen

    if (afterIndex > 0) {
      const before = points[afterIndex - 1];
      const after = points[afterIndex];

      const interpolated = interpolateTemperature(
        before.timestamp,
        before.temp,
        after.timestamp,
        after.temp,
        t
      );

      result.push({
        timestamp: t,
        temp: parseFloat(interpolated.toFixed(1)),
        time: current.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
      });
    }

    current.setMinutes(current.getMinutes() + 10); // Siirrytään seuraavaan tasaminuuttiin
  }

  return result;
}

// Laskee tilastot (min, max, keskiarvo) interpoloidusta datasta
export function calculateStats(chartData: ChartPoint[]): {
  minTemp: string;
  maxTemp: string;
  avgTemp: string;
} {
  if (chartData.length === 0) return { minTemp: '-', maxTemp: '-', avgTemp: '-' };

  const temps = chartData.map((p) => p.temp);
  return {
    minTemp: Math.min(...temps).toFixed(1),
    maxTemp: Math.max(...temps).toFixed(1),
    avgTemp: (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1),
  };
}

// Laskee X-akselin ticks: joka 6. piste = tunnin välein
export function buildXAxisTicks(data: { time: string; timestamp: number }[]): number[] {
  return data
    .filter((p) => new Date(p.timestamp).getMinutes() === 0) // Vain tasatunnit
    .map((p) => p.timestamp); // Palautetaan numero, ei teksti
}

export function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime(); // Erotus millisekunteina
  const minutes = Math.floor(diff / 60000); // Muutetaan minuuteiksi

  if (minutes < 1) return 'juuri nyt';
  if (minutes === 1) return '1 min sitten';
  if (minutes < 60) return `${minutes} min sitten`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 h sitten';
  return `${hours} h sitten`;
}
