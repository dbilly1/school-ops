import { useState, useEffect, useCallback, useRef } from 'react';
import type { ApiError } from '@/lib/api';

type State<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
};

/**
 * Generic data-fetching hook.
 *
 * @param fetcher  An async function that returns the data. Pass a stable reference
 *                 (useCallback) — the ref is always kept current so refetch() uses
 *                 the latest closure.
 * @param key      Optional value — when it changes the hook re-fetches automatically.
 *                 Use this for filter-driven fetches (e.g. key={classFilter}).
 *                 Omit for one-time fetches on mount.
 *
 * @example
 * // One-time fetch:
 * const { data } = useApi(useCallback(() => staffApi.get('/school/students'), []));
 *
 * // Re-fetch when filter changes:
 * const { data } = useApi(fetchStudents, classFilter);
 */
export function useApi<T>(fetcher: () => Promise<T>, key?: unknown) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher; // always points to latest closure

  const run = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err as ApiError });
    }
  }, []); // stable — never recreated

  // Re-fetch on mount and whenever `key` changes.
  // Components that don't pass `key` get the original one-shot-on-mount behaviour.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run, key]);

  return { ...state, refetch: run };
}
