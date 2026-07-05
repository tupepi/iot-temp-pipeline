import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'; // Tuodaan Recharts-komponentit
import {
  type Measurement,
  type WeatherForecast,
  buildInterpolatedChartData,
  calculateStats,
  getTimeAgo,
} from './utils/chartUtils';
import { fetchDevice, fetchMeasurements, fetchWeather } from './api/backendApi';
import Card from './components/Card';

interface Device {
  device_id: string;
  location: string;
  created_at: string;
}

function App() {
  const [device, setDevice] = useState<Device | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementsLoading, setMeasurementsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [showMeasured, setShowMeasured] = useState(true); // Näytetäänkö mittausviiva
  const [showForecast, setShowForecast] = useState(true); // Näytetäänkö ennusteviiva
  const [hours, setHours] = useState(12); // Oletuksena 12h

  useEffect(() => {
    fetchDevice('wemos-mittari')
      .then(setDevice)
      .catch((err) => setError(err.message))
      .finally(() => setDeviceLoading(false));
  }, []);

  useEffect(() => {
    fetchMeasurements('wemos-mittari', 48)
      .then(setMeasurements)
      .catch((err) => setError(err.message))
      .finally(() => setMeasurementsLoading(false));

    fetchWeather(48, 12)
      .then(setForecasts)
      .catch((err) => setError(err.message))
      .finally(() => setWeatherLoading(false));
  }, []);

  if (deviceLoading || measurementsLoading || weatherLoading) {
    // Odotetaan että MOLEMMAT ovat valmiita (korjattu: && → ||)
    return (
      <div className="min-h-screen dark:bg-gray-900 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
        <p className="text-sm dark:text-gray-400">Ladataan...</p>
        <p className="text-xs dark:text-gray-600">Palvelin — ilmaistaso.</p>
      </div>
    );
  }

  if (error) {
    return <p>Virhe: {error}</p>;
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000; // Aikaraja millisekunteina

  const filteredMeasurements = measurements.filter(
    (m) => new Date(m.measured_at).getTime() >= cutoff // Vain valitun ikkunan sisällä
  );

  const filteredForecasts = forecasts.filter((f) => new Date(f.forecast_time).getTime() >= cutoff);

  // Muutetaan mittaukset Rechartsille sopivaan muotoon
  const chartData = buildInterpolatedChartData(filteredMeasurements); // 1. Interpoloi raakadata
  const forecastData = filteredForecasts.map((f) => ({
    timestamp: new Date(f.forecast_time).getTime(),
    time: new Date(f.forecast_time).toLocaleTimeString('fi-FI', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    temp: parseFloat(f.temperature),
  }));
  const { minTemp, maxTemp, avgTemp } = calculateStats(chartData); // 3. Laske tilastot interpoloidusta (ei ennusteesta)
  const latest = measurements[measurements.length - 1]; // Viimeisin mittaus (järjestetty vanhimmasta uusimpaan)

  return (
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
            <span className="text-sm text-blue-400">Parvekkeen lämpötila</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showForecast}
              onChange={(e) => setShowForecast(e.target.checked)}
            />
            <span className="text-sm text-red-400">Ulkolämpötila</span>
          </label>
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="ml-auto text-sm bg-transparent dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer"
          >
            {[6, 12, 24, 48].map((h) => (
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
              tickFormatter={(timestamp) =>
                new Date(timestamp).toLocaleTimeString('fi-FI', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
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
                new Date(label).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
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
        <p className="dark:text-gray-400">
          Min: {minTemp} °C &nbsp;|&nbsp; Max: {maxTemp} °C &nbsp;|&nbsp; Keskiarvo: {avgTemp} °C
        </p>
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

export default App;
