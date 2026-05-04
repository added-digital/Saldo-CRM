"use client";

import * as React from "react";

const CACHE_PREFIX = "cache:";

type Options<T> = {
  /**
   * localStorage key (the hook prefixes it with `cache:`). Compose with the
   * user id (e.g. `customers.v1.${user.id}`) so different accounts on the
   * same browser don't see each other's data.
   */
  key: string;
  /**
   * Async function that fetches the freshest data. Called once on mount and
   * whenever `refresh()` is invoked. Should throw on error rather than
   * returning a sentinel.
   */
  fetcher: () => Promise<T>;
  /**
   * If false, the hook stays idle (no fetch, no cache read). Useful when
   * waiting for a dependency like the user id. Default true.
   */
  enabled?: boolean;
  /**
   * Cache freshness window in milliseconds.
   * When cached data is newer than this threshold, skip background refetch.
   * Default: 0 (always background refetch on cache hit).
   */
  staleMs?: number;
};

type CacheEnvelope<T> = {
  value: T;
  cachedAt: number;
};

export type UseCachedDataResult<T> = {
  /** Cached or freshly fetched data; null until the first read settles. */
  data: T | null;
  /**
   * True only on a cold cache miss (no cached value to render). When the
   * cache hits, this stays false and `refreshing` covers the background fetch.
   */
  loading: boolean;
  /** True while a background refetch is in flight (cache was already shown). */
  refreshing: boolean;
  /** Last fetch error, if any. Doesn't clear cached `data`. */
  error: Error | null;
  /** Force a fresh fetch (e.g. after a mutation). */
  refresh: () => Promise<void>;
  /**
   * Update the cached value optimistically. Accepts either a new value or an
   * updater function. Persists to localStorage immediately.
   */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

function readCache<T>(key: string): { value: T; cachedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      "value" in parsed &&
      "cachedAt" in parsed &&
      typeof (parsed as { cachedAt: unknown }).cachedAt === "number"
    ) {
      const envelope = parsed as CacheEnvelope<T>;
      return { value: envelope.value, cachedAt: envelope.cachedAt };
    }

    // Backward compatibility with legacy raw value cache format.
    return { value: parsed as T, cachedAt: 0 };
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CacheEnvelope<T> = {
      value,
      cachedAt: Date.now(),
    };
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, private mode, etc. — caching is best-effort.
  }
}

/**
 * Stale-while-revalidate caching backed by localStorage.
 *
 * On mount (or when `key` changes):
 *   1. Read the cache. If we have a value, render it immediately and kick off
 *      a background refetch (`refreshing` flips true while it runs).
 *   2. If we don't, set `loading` true and wait for the fetch.
 *   3. When the fetch resolves, update state + write to localStorage.
 *
 * Designed for list pages (customers, contacts) where the data set is small
 * enough to fit in localStorage and a few seconds of staleness is acceptable.
 * After mutations, call `refresh()` to ensure the next page load is correct.
 */
export function useCachedData<T>({
  key,
  fetcher,
  enabled = true,
  staleMs = 0,
}: Options<T>): UseCachedDataResult<T> {
  const [data, setDataState] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  // Keep the latest fetcher in a ref so the effect doesn't re-run when the
  // caller passes an inline async function.
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = React.useCallback(
    async (mode: "initial" | "background") => {
      if (mode === "background") setRefreshing(true);
      try {
        const fresh = await fetcherRef.current();
        setDataState(fresh);
        writeCache(key, fresh);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [key],
  );

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const cached = readCache<T>(key);
    if (cached !== null) {
      setDataState(cached.value);
      setLoading(false);

      const shouldRefetchInBackground =
        staleMs <= 0 || Date.now() - cached.cachedAt >= staleMs;

      if (shouldRefetchInBackground) {
        void runFetch("background");
      }
    } else {
      setLoading(true);
      void runFetch("initial");
    }
    // We intentionally don't depend on `runFetch` directly — `key` and
    // `enabled` are the real signal for "start over".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, staleMs]);

  const refresh = React.useCallback(async () => {
    await runFetch("background");
  }, [runFetch]);

  const setData: React.Dispatch<React.SetStateAction<T | null>> =
    React.useCallback(
      (value) => {
        setDataState((prev) => {
          const next =
            typeof value === "function"
              ? (value as (p: T | null) => T | null)(prev)
              : value;
          if (next !== null && next !== undefined) writeCache(key, next);
          return next;
        });
      },
      [key],
    );

  return { data, loading, refreshing, error, refresh, setData };
}
