import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A filter value kept in the URL query string, so links (and the assistant's
 * open_page) can land on a page with filters already applied. Defaults are
 * left out of the URL.
 */
export function useUrlState<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T | null) ?? fallback;
  const set = useCallback(
    (next: T) =>
      setParams(
        (p) => {
          const copy = new URLSearchParams(p);
          if (next === fallback || next === "") copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, set];
}

/** Updates several query-string keys at once (separate setters in one tick would overwrite each other). */
export function useUrlPatch() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const copy = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) copy.set(k, v);
            else copy.delete(k);
          }
          return copy;
        },
        { replace: true },
      ),
    [setParams],
  );
}
