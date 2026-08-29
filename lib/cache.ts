/**
 * Small in-memory cache so re-running an identical search does not re-bill you.
 *
 * Deliberately short-lived and in-process: Google's Places terms restrict storing
 * Places content, so this is a cost guard against double-clicking, not a lead database.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    // Evict the oldest insertion once full, keeping memory bounded.
    if (this.store.size >= MAX_ENTRIES) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

export function cacheKey(query: string, maxPages: number): string {
  return `${query.trim().toLowerCase()}::${maxPages}`;
}
