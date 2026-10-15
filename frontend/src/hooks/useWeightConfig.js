/**
 * Module-level singleton cache for weight config.
 * loadWeightConfig() is called once per app session and reused everywhere.
 */
import { loadWeightConfig } from "./useGrantHealthScore";

let _cache = null;
let _promise = null;

export async function getWeightConfigCached() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = loadWeightConfig().then(w => {
    _cache = w;
    _promise = null;
    return w;
  });
  return _promise;
}

export function invalidateWeightCache() {
  _cache = null;
  _promise = null;
}