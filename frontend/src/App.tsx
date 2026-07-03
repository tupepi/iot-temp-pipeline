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
  buildInterpolatedChartData,
  calculateStats,
  buildXAxisTicks,
} from './utils/chartUtils';
import { fetchDevice, fetchMeasurements } from './api/backendApi';
import { motion } from 'framer-motion';

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

  if (deviceLoading || measurementsLoading) {
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
  const chartData = buildInterpolatedChartData(measurements);

  const { minTemp, maxTemp, avgTemp } = calculateStats(chartData);
  const latest = measurements[measurements.length - 1]; // Viimeisin mittaus (järjestetty vanhimmasta uusimpaan)

  return (
    <div className="min-h-screen dark:text-gray-400 dark:bg-gray-900 p-2">
      <div className="mb-4">
        <h1 className="text-2xl font-bold dark:text-gray-100">IoT Temp Pipeline</h1>
        <p className="text-sm dark:text-gray-400">{device?.location}</p>
      </div>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
      >
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
      </motion.div>

      <motion.div
        className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Viivakuvaaja — ResponsiveContainer venyttää kuvaajan vanhemman elementin leveyteen */}
        <h2 className="text-lg font-semibold dark:text-gray-400 mb-2">Lämpötila — viimeiset 24h</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" /> {/* Ruudukkoviivat taustalle */}
            <XAxis dataKey="time" ticks={buildXAxisTicks(chartData)} />
            <YAxis domain={['auto', 'auto']} unit="°C" width={55} />
            <Tooltip formatter={(value) => [`${value ?? '-'} °C`, 'Lämpötila']} />{' '}
            {/* Tooltip hiiren päälle */}
            <Line
              type="monotone"
              dataKey="temp"
              dot={false}
              isAnimationActive={true}
              animationBegin={0}
              animationDuration={1500}
              animationEasing="ease-out"
            />{' '}
            {/* Viiva ilman pisteitä (dot=false), siisteämpi ulkonäkö 233 datapisteellä */}
          </LineChart>
        </ResponsiveContainer>
        <p className="dark:text-gray-400">
          Min: {minTemp} °C &nbsp;|&nbsp; Max: {maxTemp} °C &nbsp;|&nbsp; Keskiarvo: {avgTemp} °C
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
      >
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
      </motion.div>
    </div>
  );
}

export default App;
