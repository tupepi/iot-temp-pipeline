import { useState, useEffect } from 'react';  // Tuodaan Reactin tilan- ja sivuvaikutusten hallintatyökalut

// Määritellään minkä muotoista dataa odotamme backendilta (TypeScript-tyyppi)
interface Device {                              // Kuvaa yhden laitteen tietorakenteen
  device_id: string;                             // Laitteen tunniste, aina tekstiä
  location: string;                               // Laitteen sijainti, aina tekstiä
  created_at: string;                             // Rekisteröintiaika, aina tekstiä (ISO-muotoinen päivämäärä)
}

// Määritellään mittauksen tietorakenne
interface Measurement {
  measurement_id: number;        // Mittauksen yksilöllinen tunniste
  device_id: string;             // Miltä laitteelta mittaus tuli
  temperature: number;           // Mitattu lämpötila celsiusasteina
  status: string;                // Anturin tila mittaushetkellä (OK / ERROR)
  measured_at: string;           // Mittausaika ISO-muodossa
}

const BACKEND_URL = 'https://iot-temp-pipeline.onrender.com'; // Backendin osoite, vakiona ylhäällä helppoa muokkausta varten

function App() {                                  // Pääkomponentti, jonka React näyttää ruudulla
  const [error, setError] = useState<string | null>(null); // Tila mahdolliselle virheelle (alussa ei virhettä)
  
  const [device, setDevice] = useState<Device | null>(null); // Tila laitteen tiedoille: alussa null (ei vielä dataa)
  const [deviceLoading, setDeviceLoading] = useState(true);    // Tila sille, ladataanko dataa juuri nyt (alussa true)

  useEffect(() => {                                // Ajetaan tämä koodi automaattisesti, kun komponentti ilmestyy
    fetch(`${BACKEND_URL}/devices/wemos-mittari`)    // Tehdään HTTP GET -pyyntö backendin laitetieto-osoitteeseen
      .then((response) => {                          // Kun vastaus saadaan...
        if (!response.ok) {                           // ...tarkistetaan onnistuiko pyyntö (esim. ei 404/500)
          throw new Error(`Palvelin vastasi: ${response.status}`); // Jos ei onnistunut, heitetään virhe
        }
        return response.json();                       // Muutetaan vastaus JSON-olioksi
      })
      .then((data: Device) => {                      // Kun JSON on jäsennetty...
        setDevice(data);                               // ...tallennetaan se tilaan näytettäväksi
        setDeviceLoading(false);                             // ...ja merkitään lataus valmiiksi
      })
      .catch((err) => {                               // Jos jokin yllä menee pieleen (verkko, palvelin, jne.)...
        setError(err.message);                          // ...tallennetaan virheviesti tilaan
        setDeviceLoading(false);                              // ...ja merkitään lataus valmiiksi (vaikka epäonnistuneesti)
      });
  }, []);                                            // Tyhjä riippuvuuslista = ajetaan vain kerran, komponentin ilmestyessä

const [measurements, setMeasurements] = useState<Measurement[]>([]); // Tila mittauslistalle: alussa tyhjä taulukko
const [measurementsLoading, setMeasurementsLoading] = useState(true);

useEffect(() => {                                                       // Ajetaan kerran komponentin ilmestyessä
  fetch(`${BACKEND_URL}/measurements/wemos-mittari`)                    // Haetaan kaikki laitteen mittaukset
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Palvelin vastasi: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      setMeasurements(data.measurements);  // Otetaan vain measurements-taulukko
    })
    .catch((err) => {
      setError(err.message);                                            // Käytetään samaa virhetilaa kuin laitehaussa
      setMeasurementsLoading(false);                                    // Merkitään mittauslataus valmiiksi (vaikka epäonnistuneesti)
    });
}, []);                                                                 // Tyhjä riippuvuuslista = ajetaan vain kerran

  if (deviceLoading && measurementsLoading) {                                     // Jos data on yhä latautumassa...
    return <p>Ladataan...</p>;                         // ...näytetään yksinkertainen latausviesti
  }

  if (error) {                                       // Jos haku epäonnistui...
    return <p>Virhe: {error}</p>;                       // ...näytetään virheviesti
  }

  return (                                            // Jos kaikki onnistui...
    <div>
      <h1>IoT Temp Pipeline</h1>                        {/* Otsikko */}
      <p>Laite: {device?.device_id}</p>                  {/* Näytetään laitteen tunniste */}
      <p>Sijainti: {device?.location}</p>                 {/* Näytetään laitteen sijainti */}
      <p>Viimeisin lämpötila: {measurements[measurements.length - 1]?.temperature} °C</p>
      <p>Mitattu: {measurements[measurements.length - 1] ? new Date(measurements[measurements.length - 1].measured_at).toLocaleString('fi-FI') : ''}</p>
      <p>Aiemmat mittaukset: <ul>{measurements.slice(0, -1).reverse().map((m, i) => (<li key={i}>{m.temperature} °C, {new Date(m.measured_at).toLocaleString('fi-FI')}</li>))}</ul></p>
    </div>
  );
}

export default App;                                  // Viedään komponentti main.tsx:n käytettäväksi