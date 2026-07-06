import { useEffect, useRef, useState } from 'react'; // Reactin tila-, viite- ja sivuvaikutushookit

// Yleiskäyttöinen hook: hakee datan annetulla funktiolla ja seuraa sen tilaa (data/loading/error)
// refetchIntervalMs: jos annettu, haku toistetaan taustalla säännöllisin väliajoin sivua päivittämättä
export function useFetch<T>(fetchFn: () => Promise<T>, deps: unknown[] = [], refetchIntervalMs?: number) { // deps määrittää milloin haku aloitetaan uudelleen alusta
  const [data, setData] = useState<T | null>(null); // Haettu data, null kunnes valmis tai jos haku epäonnistui
  const [loading, setLoading] = useState(true); // Onko ALKUPERÄINEN haku vielä kesken
  const [error, setError] = useState<string | null>(null); // Alkuperäisen haun virheviesti

  const fetchFnRef = useRef(fetchFn); // Pidetään tuorein hakufunktio ilman että se laukaisee efektin uudelleen
  fetchFnRef.current = fetchFn; // Päivitetään viite joka renderillä

  useEffect(() => { // Suoritetaan haku kun riippuvuudet muuttuvat
    let isFirstLoad = true; // Erottaa alkulatauksen taustalla tapahtuvista uudelleenhauista

    function load() { // Suorittaa yhden hakukierroksen
      if (isFirstLoad) setLoading(true); // Näytetään latausindikaattori vain ensimmäisellä kerralla
      fetchFnRef.current() // Kutsutaan tuoreinta hakufunktiota
        .then((result) => { // Onnistuneessa haussa
          setData(result); // Tallennetaan tuore data tilaan
          setError(null); // Nollataan mahdollinen aiempi virhe
        })
        .catch((err) => { // Epäonnistuneessa haussa
          if (isFirstLoad) { // Alkulatauksen epäonnistuminen näytetään käyttäjälle asti
            setError(err.message); // Tallennetaan virheviesti tilaan
          } else { // Taustapäivityksen epäonnistuminen ei saa piilottaa jo näkyvää dataa
            console.error('Taustapäivitys epäonnistui:', err); // Lokitetaan virhe konsoliin
          } // If/else-lohkon loppu
        })
        .finally(() => { // Ajetaan onnistumisesta riippumatta
          if (isFirstLoad) setLoading(false); // Lopetetaan latausindikaattori vain alkulatauksen jälkeen
          isFirstLoad = false; // Seuraavat kutsut ovat taustapäivityksiä
        });
    } // Funktion loppu

    load(); // Tehdään ensimmäinen haku heti

    if (!refetchIntervalMs) return; // Jos ei ajastettu, ei tarvita ajastinta eikä siivousta
    const intervalId = setInterval(load, refetchIntervalMs); // Ajastetaan taustahaku annetuin väliajoin
    return () => clearInterval(intervalId); // Siivotaan ajastin pois kun komponentti puretaan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps); // Ajetaan uudelleen vain kun deps muuttuu (deps tulee kutsujalta, joten linter ei voi analysoida sitä staattisesti)

  return { data, loading, error }; // Palautetaan tila komponentille
} // Funktion loppu
