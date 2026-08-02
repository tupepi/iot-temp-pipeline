-- Tietokantaskeema iot-temp-pipeline -backendille.
-- Ajetaan kertaalleen uudessa Neon-projektissa (esim. Neonin SQL Editorista tai psql:llä)
-- ennen kuin backend tai laite lähettää ensimmäistäkään mittausta.

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY, -- Laitteen tunniste, esim. "wemos-mittari"
  location TEXT NOT NULL, -- Laitteen sijainti dashboardia varten, esim. "Parveke"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now() -- Laitteen rekisteröintiaika
);

CREATE TABLE measurements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(device_id), -- Viittaus laitteeseen
  temperature NUMERIC, -- Mitattu lämpötila, NULL jos anturi virheessä
  status TEXT NOT NULL, -- Anturin tilatieto ("OK"/"ERROR")
  measured_at TIMESTAMPTZ NOT NULL, -- Mittauksen ajanhetki (laitteen lähettämä ISO-aikaleima)
  UNIQUE (device_id, measured_at) -- Estää saman mittauksen tuplatallennuksen (idempotenssi)
);

CREATE TABLE weather_forecasts (
  forecast_time TIMESTAMPTZ PRIMARY KEY, -- Ennusteen ajanhetki, uniikki per aikapiste
  temperature NUMERIC, -- Ennustettu lämpötila
  symbol_code TEXT, -- Yr.non sääsymbolin koodi, voi olla NULL
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now() -- Milloin ennuste haettiin/päivitettiin viimeksi
);

-- Laiterivi vaaditaan ennen kuin /devices/:deviceId ja mittausten tallennus (FK) toimivat.
-- Vaihda sijainti oikeaksi ennen ajoa.
INSERT INTO devices (device_id, location) VALUES ('wemos-mittari', 'Parveke');
