import { useState, useEffect } from 'react';  // Tuodaan Reactin tilan- ja sivuvaikutusten hallintatyökalut

// Määritellään minkä muotoista dataa odotamme backendilta (TypeScript-tyyppi)
interface Device {                              // Kuvaa yhden laitteen tietorakenteen
  device_id: string;                             // Laitteen tunniste, aina tekstiä
  location: string;                               // Laitteen sijainti, aina tekstiä
  created_at: string;                             // Rekisteröintiaika, aina tekstiä (ISO-muotoinen päivämäärä)
}

const BACKEND_URL = 'https://iot-temp-pipeline.onrender.com'; // Backendin osoite, vakiona ylhäällä helppoa muokkausta varten

function App() {                                  // Pääkomponentti, jonka React näyttää ruudulla
  const [device, setDevice] = useState<Device | null>(null); // Tila laitteen tiedoille: alussa null (ei vielä dataa)
  const [loading, setLoading] = useState(true);    // Tila sille, ladataanko dataa juuri nyt (alussa true)
  const [error, setError] = useState<string | null>(null); // Tila mahdolliselle virheelle (alussa ei virhettä)

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
        setLoading(false);                             // ...ja merkitään lataus valmiiksi
      })
      .catch((err) => {                               // Jos jokin yllä menee pieleen (verkko, palvelin, jne.)...
        setError(err.message);                          // ...tallennetaan virheviesti tilaan
        setLoading(false);                              // ...ja merkitään lataus valmiiksi (vaikka epäonnistuneesti)
      });
  }, []);                                            // Tyhjä riippuvuuslista = ajetaan vain kerran, komponentin ilmestyessä

  if (loading) {                                     // Jos data on yhä latautumassa...
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
    </div>
  );
}

export default App;                                  // Viedään komponentti main.tsx:n käytettäväksi