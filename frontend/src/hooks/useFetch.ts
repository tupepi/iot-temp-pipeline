import { useEffect, useState } from 'react'; // Reactin tila- ja sivuvaikutushookit

// Yleiskäyttöinen hook: hakee datan annetulla funktiolla ja seuraa sen tilaa (data/loading/error)
export function useFetch<T>(fetchFn: () => Promise<T>, deps: unknown[] = []) { // deps määrittää milloin haku toistetaan
  const [data, setData] = useState<T | null>(null); // Haettu data, null kunnes valmis tai jos haku epäonnistui
  const [loading, setLoading] = useState(true); // Onko haku vielä kesken
  const [error, setError] = useState<string | null>(null); // Mahdollinen virheviesti

  useEffect(() => { // Suoritetaan haku kun riippuvuudet muuttuvat
    setLoading(true); // Merkitään haku käynnissä olevaksi
    setError(null); // Nollataan edellinen virhe
    fetchFn() // Kutsutaan annettua hakufunktiota
      .then(setData) // Tallennetaan tulos tilaan
      .catch((err) => setError(err.message)) // Virhetilanteessa tallennetaan virheviesti
      .finally(() => setLoading(false)); // Lopetetaan latausindikaattori joka tapauksessa
  }, deps); // Ajetaan uudelleen vain kun deps muuttuu (deps tulee kutsujalta, joten linter ei voi analysoida sitä staattisesti)

  return { data, loading, error }; // Palautetaan tila komponentille
} // Funktion loppu
