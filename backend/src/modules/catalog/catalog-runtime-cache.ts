type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const values = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const keyGenerations = new Map<string, number>();
let globalGeneration = 0;

function ttlMs(): number {
  const value = Number(process.env.CATALOG_CACHE_TTL_MS ?? 15_000);
  return Number.isInteger(value) && value >= 1_000 && value <= 300_000 ? value : 15_000;
}

export async function getCatalogRuntimeCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const current = values.get(key);
  if (current && current.expiresAt > Date.now()) return current.value as T;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const startedGlobalGeneration = globalGeneration;
  const startedKeyGeneration = keyGenerations.get(key) ?? 0;
  const loading = loader()
    .then((value) => {
      if (
        startedGlobalGeneration === globalGeneration &&
        startedKeyGeneration === (keyGenerations.get(key) ?? 0)
      ) {
        values.set(key, { value, expiresAt: Date.now() + ttlMs() });
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === loading) inFlight.delete(key);
    });
  inFlight.set(key, loading);
  return loading;
}

export function invalidateCatalogRuntimeCaches(): void {
  globalGeneration += 1;
  keyGenerations.clear();
  values.clear();
  inFlight.clear();
}

export function invalidateCatalogRuntimeCachePrefixes(prefixes: string[]): void {
  const normalizedPrefixes = prefixes.filter(Boolean);
  if (normalizedPrefixes.length === 0) return;
  const keys = new Set([...values.keys(), ...inFlight.keys()]);
  for (const key of keys) {
    if (!normalizedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    keyGenerations.set(key, (keyGenerations.get(key) ?? 0) + 1);
    values.delete(key);
    inFlight.delete(key);
  }
}
