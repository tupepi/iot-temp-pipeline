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
  buildXAxisTicks,
  buildCombinedChartData,
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

  useEffect(() => {
    fetchWeather(12)
      .then(setForecasts)
      .catch((err) => setError(err.message))
      .finally(() => setWeatherLoading(false));
  }, []);

  useEffect(() => {
    fetchDevice('wemos-mittari')
      .then(setDevice)
      .catch((err) => setError(err.message))
      .finally(() => setDeviceLoading(false));
  }, []);

  useEffect(() => {
    fetchMeasurements('wemos-mittari')
      .then(setMeasurements)
      .catch((err) => setError(err.message))
      .finally(() => setMeasurementsLoading(false));
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

  // Muutetaan mittaukset Rechartsille sopivaan muotoon
  const chartData = buildInterpolatedChartData(measurements); // 1. Interpoloi raakadata
  const combinedData = buildCombinedChartData(chartData, forecasts); // 2. Yhdistä ennusteeseen
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
            <span className="text-sm dark:text-gray-400">
              {new Date(latest.measured_at).toLocaleString('fi-FI')}
            </span>
          </div>
        )}
      </Card>

      <Card delay={0.2} className="px-2 py-6">
        {/* Viivakuvaaja — ResponsiveContainer venyttää kuvaajan vanhemman elementin leveyteen */}
        <h2 className="text-lg font-semibold dark:text-gray-400 mb-2">Lämpötila — viimeiset 24h</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={combinedData}>
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
              ticks={buildXAxisTicks(combinedData)}
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
            />
            <YAxis domain={['auto', 'auto']} unit="°C" width={40} />
            <Tooltip
              formatter={(value) => [`${value ?? '-'} °C`, 'Lämpötila']}
              labelFormatter={(label) =>
                new Date(label).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
              }
            />{' '}
            {/* Tooltip hiiren päälle */}
            <Line
              type="monotone"
              dataKey="measured"
              stroke="#60A5FA"
              dot={false}
              name="Mittaus"
              connectNulls={false}
              isAnimationActive={true}
              animationBegin={0}
              animationDuration={1500}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#F87171"
              dot={false}
              name="Ennuste"
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={1500}
              animationEasing="ease-out"
            />{' '}
          </LineChart>
        </ResponsiveContainer>
        <p className="dark:text-gray-400">
          Min: {minTemp} °C &nbsp;|&nbsp; Max: {maxTemp} °C &nbsp;|&nbsp; Keskiarvo: {avgTemp} °C
        </p>
      </Card>

      <Card delay={0.3}>
        <h2 className="text-lg font-semibold dark:text-gray-100 mb-2">Taustaa</h2>
        <p>
          Hen&shy;ki&shy;lö&shy;koh&shy;tai&shy;nen IoT-pro&shy;jek&shy;ti:
          ul&shy;ko&shy;läm&shy;pö&shy;ti&shy;lan mit&shy;taus ESP32:lla, da&shy;ta pil&shy;veen,
          React-dash&shy;board sää&shy;en&shy;nus&shy;te&shy;ver&shy;tai&shy;lul&shy;la (WIP)
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
