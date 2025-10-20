import { useEffect, useMemo, useState } from 'react';
import { suggestChannels, Suggestion } from '../services/youtubeService';

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useSuggestions(query: string) {
  const q = useDebounced(query.trim(), 250);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    async function run() {
      if (!q) { setResults([]); return; }
      setLoading(true);
      try {
        const s = await suggestChannels(q);
        if (live) setResults(s);
      } finally {
        if (live) setLoading(false);
      }
    }
    run();
    return () => { live = false; };
  }, [q]);

  return useMemo(() => ({ results, loading }), [results, loading]);
}

