import { useState, useEffect } from "react";

/**
 * Debounces a value by the given delay (ms).
 * Prevents excessive re-renders/API calls on rapid input changes.
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}