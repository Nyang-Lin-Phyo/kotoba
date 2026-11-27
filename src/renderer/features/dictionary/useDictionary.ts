import { useCallback, useEffect, useState } from 'react';
import type { DictionaryEntry, DictionaryResult } from '../../../shared/contracts';
import type { AsyncState } from '../../lib/useAsync';

/** Debounced bounded search. Never sends a query shorter than one character. */
export function useDictionarySearch(query: string, delayMs = 300): AsyncState<readonly DictionaryResult[]> {
  const [state, setState] = useState<AsyncState<readonly DictionaryResult[]>>({
    status: 'ready',
    data: [],
    error: null,
  });

  useEffect(() => {
    if (query.trim().length === 0) {
      setState({ status: 'ready', data: [], error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    const handle = setTimeout(() => {
      void window.kotoba.dictionary
        .search({ query: query.trim(), limit: 20, offset: 0 })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setState({ status: 'ready', data: result.data, error: null });
          else setState({ status: 'error', data: null, error: result.error.message });
        });
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, delayMs]);

  return state;
}

export function useDictionaryEntry(id: string | null) {
  const load = useCallback(() => {
    if (id === null) return Promise.resolve({ ok: true as const, data: null });
    return window.kotoba.dictionary.getEntry({ id });
  }, [id]);

  const [entry, setEntry] = useState<{ readonly data: DictionaryEntry | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void load().then((result) => {
      if (cancelled) return;
      if (result.ok) setEntry({ data: result.data });
      else setError(result.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { entry: entry?.data ?? null, error };
}
