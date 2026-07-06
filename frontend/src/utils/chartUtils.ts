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

// Muuntaa mittaukset kuvaajan pisteiksi — ei interpolointia, X-akselin tickeistä huolehtivat
// buildHourTicks (lyhyet välit) ja buildDayTicks (pitkät välit), joten aidot mittausajat riittävät sellaisenaan
export function buildChartData(measurements: Measurement[]): ChartPoint[] {
  // Suodattaa ja muuntaa mittaukset kuvaajan muotoon
  return measurements
    .filter((m) => m.status === 'OK') // Jätetään virheelliset mittaukset pois
    .map((m) => {
      const timestamp = new Date(m.measured_at).getTime(); // ISO-aika → millisekunteja
      return {
        timestamp, // Todellinen mittausaika, ei pyöristetty ruudukkoon
        temp: parseFloat(m.temperature), // Lämpötila numerona
        time: new Date(timestamp).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }), // Kellonaika X-akselia varten
      };
    }); // Palautetaan kaikki suodatetut pisteet
} // Funktion loppu

// Sallitut tick-välit tunteina lyhyille aikaväleille, pienimmästä suurimpaan
const HOUR_TICK_STEPS = [1, 2, 3, 4, 6, 12];

// Laskee X-akselin tickit tasatunneille (esim. 08:00, 11:00, 14:00) lyhyitä aikavälejä varten
// Recharts ei osaa itse pyöristää numeerisen akselin tickejä kellonaikoihin, joten se tehdään tässä käsin
// Ottaa suoraan aikavälin rajat (ei kuvaajan datapisteitä), jotta sama tick-alue voidaan laskea sekä
// mittaus- että ennustedatan yhdistetylle aikavälille — muuten tickit puuttuisivat ennusteen ylittämältä osalta
export function buildHourTicks(first: number, last: number, maxTicks: number = 4): number[] {
  // Ottaa aikavälin rajat ja tickien enimmäismäärän
  if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) return []; // Ei kelvollista väliä: ei tickejä

  const spanHours = (last - first) / (60 * 60 * 1000); // Aikavälin pituus tunteina

  // Valitaan pienin tick-väli, jolla tickejä mahtuu korkeintaan maxTicks kappaletta
  const stepHours =
    HOUR_TICK_STEPS.find((h) => spanHours / h <= maxTicks) ?? HOUR_TICK_STEPS[HOUR_TICK_STEPS.length - 1];

  const current = new Date(first); // Liikkuva ajanhetki-osoitin
  current.setMinutes(0, 0, 0); // Pyöristetään lähimpään tasatuntiin alaspäin
  if (current.getTime() < first) current.setHours(current.getHours() + 1); // Varmistetaan että ensimmäinen tick on datan sisällä
  while (current.getHours() % stepHours !== 0) current.setHours(current.getHours() + 1); // Siirrytään seuraavaan tick-välin monikertaan

  const ticks: number[] = []; // Kerätään tasatunnit tähän
  while (current.getTime() <= last) {
    // Käydään läpi jokainen tick-väli loppuun asti
    ticks.push(current.getTime()); // Lisätään tasatunti listaan
    current.setHours(current.getHours() + stepHours); // Siirrytään seuraavaan tickiin
  } // While-silmukan loppu

  return ticks; // Palautetaan lasketut tickit
} // Funktion loppu

// Laskee X-akselin tickit vuorokauden vaihtumiskohtiin (keskiyöhön) pitkiä aikavälejä varten
// Harventaa tickit automaattisesti niin että niitä on korkeintaan maxTicks kappaletta
// Ottaa suoraan aikavälin rajat (ei kuvaajan datapisteitä), jotta sama tick-alue voidaan laskea sekä
// mittaus- että ennustedatan yhdistetylle aikavälille — muuten tickit puuttuisivat ennusteen ylittämältä osalta
export function buildDayTicks(first: number, last: number, maxTicks: number = 5): number[] {
  // Ottaa aikavälin rajat ja tickien enimmäismäärän
  if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) return []; // Ei kelvollista väliä: ei tickejä

  const dayStarts: number[] = []; // Kerätään kaikki vuorokauden alut väliltä tähän
  const current = new Date(first); // Liikkuva päivämäärä-osoitin
  current.setHours(0, 0, 0, 0); // Pyöristetään ensimmäisen pisteen vuorokauden alkuun
  if (current.getTime() < first) current.setDate(current.getDate() + 1); // Siirrytään ensimmäiseen vaihdokseen datan sisällä

  while (current.getTime() <= last) { // Käydään läpi jokainen vuorokauden vaihdos loppuun asti
    dayStarts.push(current.getTime()); // Lisätään vaihdoshetki listaan
    current.setDate(current.getDate() + 1); // Siirrytään seuraavaan vuorokauteen
  } // While-silmukan loppu

  if (dayStarts.length === 2) {
    // Vain kaksi vuorokauden vaihtumiskohtaa: lisätään niiden puoliväliin kello 12:00 -tick, jotta tickejä on vähintään kolme
    const noon = new Date(dayStarts[0]); // Ensimmäinen vuorokauden vaihtumiskohta
    noon.setHours(12, 0, 0, 0); // Sama vuorokausi, kello 12:00 (paikallinen aika, kestää kesäajan vaihdoksen)
    return [dayStarts[0], noon.getTime(), dayStarts[1]]; // Keskimmäinen tick väliin
  } // If-lohkon loppu

  if (dayStarts.length <= maxTicks) return dayStarts; // Ei tarvetta harventaa

  const step = Math.ceil(dayStarts.length / maxTicks); // Joka monennesta vaihdoksesta pidetään tick
  return dayStarts.filter((_, i) => i % step === 0); // Palautetaan harvennettu lista
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
