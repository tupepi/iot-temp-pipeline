const BACKEND_URL = 'https://iot-temp-pipeline.onrender.com'; // Yksi paikka URL:lle

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