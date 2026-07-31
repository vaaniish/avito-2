type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const values = new Map<string, CacheEntry>();
let generation = 0;

function ttlMs(): number {
  const value = Number(process.env.CATALOG_CACHE_TTL_MS ?? 15_000);
  return Number.isInteger(value) && value >= 1_000 && value <= 300_000 ? value : 15_000;
}

export async function getCatalogRuntimeCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const current = values.get(key);
  if (current && current.expiresAt > Date.now()) return current.value as T;
  const startedGeneration = generation;
  const value = await loader();
  if (startedGeneration === generation) {
    values.set(key, { value, expiresAt: Date.now() + ttlMs() });
  }
  return value;
}

export function invalidateCatalogRuntimeCaches(): void {
  generation += 1;
  values.clear();
}
