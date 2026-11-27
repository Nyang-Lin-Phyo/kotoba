import { useCallback, useEffect, useState } from 'react';
import type { Result } from '../../shared/errors';

export type AsyncState<T> =
  | { readonly status: 'loading'; readonly data: null; readonly error: null }
  | { readonly status: 'ready'; readonly data: T; readonly error: null }
  | { readonly status: 'error'; readonly data: null; readonly error: string };

/**
 * Runs an IPC call and tracks loading/ready/error. `load` must be stable
 * (wrap it in `useCallback`) or the effect will re-run on every render.
 */
export function useAsync<T>(load: () => Promise<Result<T>>): {
  state: AsyncState<T>;
  reload: () => void;
} {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    load()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState({ status: 'ready', data: result.data, error: null });
        } else {
          setState({ status: 'error', data: null, error: result.error.message });
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          data: null,
          error: cause instanceof Error ? cause.message : 'Unknown error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { state, reload };
}
