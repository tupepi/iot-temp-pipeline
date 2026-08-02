import { useState } from 'react'; // Tuodaan Reactin tila-hooki
import {
  LineChart, // Kuvaajan säiliökomponentti
  Line, // Yksittäinen viiva kuvaajassa
  XAxis, // X-akseli (aika)
  YAxis, // Y-akseli (lämpötila)
  CartesianGrid, // Taustan ruudukkoviivat
  Tooltip, // Hiiren päälle tuleva tietolaatikko
  ResponsiveContainer, // Venyttää kuvaajan vanhemman elementin kokoiseksi
} from 'recharts'; // Tuodaan Recharts-komponentit
import {
  type Measurement, // Mittauksen tyyppi
  type WeatherForecast, // Sääennusteen tyyppi
  buildChartData, // Suodattaa ja muuntaa mittaukset kuvaajan pisteiksi
  buildHourTicks, // Laskee X-akselin tickit tasatunneille lyhyitä aikavälejä varten
  buildDayTicks, // Laskee X-akselin tickit vuorokauden vaihtumiskohtiin pitkiä aikavälejä varten
  getTimeAgo, // Muotoilee "X min sitten" -tekstin
} from './utils/chartUtils'; // Tuodaan kuvaajan apufunktiot ja tyypit
import {
  fetchDevice, // Hakee laitteen perustiedot
  fetchMeasurements, // Hakee mittaukset viimeisimmältä aikaväliltä
  fetchWeather, // Hakee sääennusteet
} from './api/backendApi'; // Tuodaan backendin hakufunktiot
import { useFetch } from './hooks/useFetch'; // Tuodaan yhteinen haku/lataus/virhe-hook
import Card from './components/Card'; // Tuodaan yhteinen korttikomponentti

const REFETCH_INTERVAL_MS = 10 * 60 * 1000; // Taustapäivitysväli: 10 minuuttia, sama tahti kuin laitteen mittausten lähetyksellä

interface Device {
  // Laitteen perustiedot backendista
  device_id: string; // Laitteen tunniste
  location: string; // Laitteen sijainti (esim. "Parveke")
}

function App() {
  // Sovelluksen juurikomponentti
  const { data: device, loading: deviceLoading } = useFetch<Device>(
    () => fetchDevice('wemos-mittari'),
    []
  ); // Laitteen perustiedot — ei-kriittinen, puuttuminen ei estä näkymää
  const {
    data: measurementsData,
    loading: measurementsLoading,
    error: measurementsError,
  } = useFetch<Measurement[]>(
    () => fetchMeasurements('wemos-mittari', 24),
    [],
    REFETCH_INTERVAL_MS
  ); // Mittaushistoria — ydindata, jota ilman ei ole mitään näytettävää, päivittyy taustalla
  const { data: forecastsData, loading: weatherLoading } = useFetch<WeatherForecast[]>(
    () => fetchWeather(24, 12),
    [],
    REFETCH_INTERVAL_MS
  ); // Sääennusteet — ei-kriittinen, puuttuminen piilottaa vain ennusteviivan, päivittyy taustalla

  const measurements = measurementsData ?? []; // Oletustyhjä taulukko latauksen tai virheen ajaksi
  const forecasts = forecastsData ?? []; // Oletustyhjä taulukko latauksen tai virheen ajaksi

  const [showMeasured, setShowMeasured] = useState(true); // Näytetäänkö mittausviiva
  const [showForecast, setShowForecast] = useState(true); // Näytetäänkö ennusteviiva
  const [hours, setHours] = useState(12); // Näytettävän aikaikkunan pituus tunteina (valittavissa 6/12/24h pudotusvalikosta)

  function handleHoursChange(value: number) {
    // Tuntivalikon valinta
    setHours(value); // Päivitetään valittu aikaikkuna
  } // Funktion loppu

  if (deviceLoading || measurementsLoading || weatherLoading) {
    // Odotetaan että kaikki kolme hakua ovat valmiita
    return (
      // Näytetään latausanimaatio kunnes data on valmis
      <div className="min-h-screen dark:bg-gray-900 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
        <p className="text-sm dark:text-gray-400">Ladataan...</p>
        <p className="text-xs dark:text-gray-600">Palvelin — ilmaistaso.</p>
      </div>
    );
  }

  if (measurementsError) {
    // Vain ydindatan (mittausten) puuttuminen estää koko näkymän — laite- tai sääennustevirhe ei saa piilottaa mittauksia
    return <p>Virhe: {measurementsError}</p>; // Näytetään virheviesti sivun sijaan
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000; // Aikaraja millisekunteina

  const filteredMeasurements = measurements.filter(
    (m) => new Date(m.measured_at).getTime() >= cutoff // Vain valitun ikkunan sisällä
  ); // Rajataan mittaukset valitun aikaikkunan sisälle

  const filteredForecasts = forecasts.filter((f) => new Date(f.forecast_time).getTime() >= cutoff); // Rajataan ennusteet samaan ikkunaan

  // Muutetaan mittaukset Rechartsille sopivaan muotoon
  const chartData = buildChartData(filteredMeasurements); // 1. Suodatetaan ja muunnetaan mittaukset kuvaajan muotoon
  const forecastData = filteredForecasts.map((f) => ({
    // 2. Muunnetaan ennusteet kuvaajan muotoon
    timestamp: new Date(f.forecast_time).getTime(), // Unix-aika millisekunteina
    time: new Date(f.forecast_time).toLocaleTimeString('fi-FI', {
      // Kellonaika X-akselia varten
      hour: '2-digit',
      minute: '2-digit',
    }),
    temp: parseFloat(f.temperature), // Lämpötila numerona
  }));
  const latest = measurements[measurements.length - 1]; // Viimeisin mittaus (järjestetty vanhimmasta uusimpaan)

  // Kuvaajan todellinen aikaväli kattaa vain näkyvät viivat — jos jompikumpi on piilotettu valintaruudulla,
  // sen data ei ole mukana XAxis:n domain={['dataMin','dataMax']}-laskennassa, joten ei tickeissäkään,
  // muuten viimeinen tick voisi osua näkyvän datan ulkopuolelle (esim. ennuste ulottuu mittauksia pidemmälle)
  const axisTimestamps = [
    ...(showMeasured ? chartData : []),
    ...(showForecast ? forecastData : []),
  ].map((p) => p.timestamp); // Vain näkyvien viivojen aikaleimat yhteen listaan
  const axisFirst = axisTimestamps.length ? Math.min(...axisTimestamps) : 0; // Näkyvän kuvaajan ensimmäinen ajanhetki
  const axisLast = axisTimestamps.length ? Math.max(...axisTimestamps) : 0; // Näkyvän kuvaajan viimeinen ajanhetki

  const spanMs = axisLast - axisFirst; // Näytettävän kuvaajan aikavälin pituus millisekunteina
  const isLongRange = spanMs > 24 * 60 * 60 * 1000; // Yli vuorokauden mittainen väli: näytetään päivämäärätickit kellonajan sijaan
  // Rechartsin scale="time" ei riitä: type="number" + horizontal-layout käsitellään aina kategorisena akselina,
  // jolloin Recharts käyttää tick-arvoina suoraan jokaista datapistettä d3:n scale.ticks():n sijaan — siksi
  // tickit on laskettava itse ja annettava eksplisiittisenä ticks-proppina, joka ohittaa tämän kategorisen polun
  const axisTicks = isLongRange
    ? buildDayTicks(axisFirst, axisLast) // Pitkillä väleillä vuorokauden vaihtumiskohdat
    : buildHourTicks(axisFirst, axisLast); // Muuten tasatunnit

  return (
    // Varsinainen sivun sisältö
    <div className="min-h-screen dark:text-gray-400 dark:bg-gray-900 p-2">
      <div className="mb-4">
        <h1 className="text-2xl font-bold dark:text-gray-100">IoT Temp Pipeline</h1>
        <p className="text-sm dark:text-gray-400">{device?.location}</p>
      </div>
      <Card delay={0.1}>
        {latest && (
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-5xl font-bold dark:text-gray-100">
              {parseFloat(latest.temperature).toFixed(1)} °C
            </span>
            <span className="text-sm dark:text-gray-400">{getTimeAgo(latest.measured_at)}</span>
          </div>
        )}
      </Card>

      <Card delay={0.2} className="px-2 py-6">
        {/* Viivakuvaaja — ResponsiveContainer venyttää kuvaajan vanhemman elementin leveyteen */}
        <div className="flex gap-6 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMeasured}
              onChange={(e) => setShowMeasured(e.target.checked)}
            />
            <span className="text-sm text-blue-400">Parvek&shy;keen lämpö&shy;tila</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showForecast}
              onChange={(e) => setShowForecast(e.target.checked)}
            />
            <span className="text-sm text-red-400">Ulko&shy;lämpö&shy;tila</span>
          </label>
          <select
            value={hours}
            onChange={(e) => handleHoursChange(parseInt(e.target.value))}
            className="ml-auto text-sm bg-transparent dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer"
          >
            {[6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />{' '}
            {/* Ruudukkoviivat taustalle */}
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={axisTicks} // Pitkillä väleillä vuorokauden vaihtumiskohdat, muuten tasatunnit
              tickFormatter={(timestamp) => {
                if (!isLongRange) {
                  return new Date(timestamp).toLocaleTimeString('fi-FI', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }); // Lyhyellä välillä pelkkä kellonaika riittää
                }
                const date = new Date(timestamp); // Pitkän välin tick, joko vuorokauden vaihtumiskohta tai puoliväliin lisätty kello 12:00
                const dateLabel = date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }); // Päivämäärä näytetään aina
                const isMidnight = date.getHours() === 0 && date.getMinutes() === 0; // Tavalliset päivätickit osuvat aina keskiyöhön
                if (isMidnight) return dateLabel; // Keskiyön tick: pelkkä päivämäärä riittää yksiselitteisesti
                const timeLabel = date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }); // Väliin lisätty kello 12:00 -tick tarvitsee myös kellonajan erottuakseen
                return `${dateLabel} ${timeLabel}`;
              }}
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
            />
            <YAxis
              domain={['auto', 'auto']}
              unit="°C"
              width={40}
              tickFormatter={(value) => String(Math.round(value))}
              allowDecimals={false}
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
            />
            <Tooltip
              formatter={(value) => [`${value ?? '-'} °C`, 'Lämpötila']}
              labelFormatter={(label) =>
                isLongRange
                  ? new Date(label).toLocaleString('fi-FI', {
                      day: 'numeric',
                      month: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : new Date(label).toLocaleTimeString('fi-FI', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
              }
            />{' '}
            {/* Tooltip hiiren päälle */}
            {showMeasured && (
              <Line
                data={chartData}
                type="monotone"
                dataKey="temp"
                stroke="#60A5FA"
                dot={false}
                name="Parvekkeen lämpötila"
                connectNulls={false}
                isAnimationActive={true}
                animationBegin={0}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            )}
            {showForecast && (
              <Line
                data={forecastData}
                type="monotone"
                dataKey="temp"
                stroke="#F87171"
                dot={false}
                name="Ulkolämpötila"
                connectNulls={false}
                isAnimationActive={true}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            )}{' '}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card delay={0.3}>
        <h2 className="text-lg font-semibold dark:text-gray-100 mb-2">Taustaa</h2>
        <p>
          Hen&shy;ki&shy;lö&shy;koh&shy;tai&shy;nen IoT-pro&shy;jek&shy;ti: par&shy;vek&shy;keen
          läm&shy;pö&shy;ti&shy;lan mit&shy;taus ESP32:lla, da&shy;ta pil&shy;veen,
          React-dash&shy;board sää&shy;en&shy;nus&shy;te&shy;ver&shy;tai&shy;lul&shy;la.
        </p>
        <a
          className="text-blue-400 hover:underline"
          href="https://github.com/tupepi/iot-temp-pipeline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </Card>
    </div>
  );
}

export default App; // Viedään komponentti main.tsx:n käytettäväksi
