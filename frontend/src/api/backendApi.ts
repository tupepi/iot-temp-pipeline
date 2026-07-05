const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://iot-temp-pipeline.onrender.com';

export async function fetchDevice(deviceId: string) {
  const response = await fetch(`${BACKEND_URL}/devices/${deviceId}`);
  if (!response.ok) throw new Error(`Palvelin vastasi: ${response.status}`);
  return response.json();
}

export async function fetchMeasurements(deviceId: string, hours: number = 24) {
  const response = await fetch(`${BACKEND_URL}/measurements/${deviceId}?hours=${hours}`);
  if (!response.ok) throw new Error(`Palvelin vastasi: ${response.status}`);
  const data = await response.json();
  return data.measurements;
}

export async function fetchWeather(pastHours: number = 24, futureHours: number = 12) {
  const response = await fetch(
    `${BACKEND_URL}/weather?pastHours=${pastHours}&futureHours=${futureHours}`
  );
  if (!response.ok) throw new Error(`Palvelin vastasi: ${response.status}`);
  const data = await response.json();
  return data.forecasts;
}
