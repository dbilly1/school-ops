import { Injectable } from '@nestjs/common';

/**
 * Tiny in-process TTL cache for authorization resolution (security review
 * performance pass).
 *
 * The permission + feature-flag checks that gate every request read
 * near-static data (package contents, feature activation state, role/user
 * overrides). Before this cache each gated request fired 5–10 sequential
 * round-trips to the (eu-west-1) database *before* the controller ran. We
 * memoize those results per school for a short TTL, with explicit invalidation
 * on the known write paths so toggles still take effect promptly. The TTL is a
 * backstop for any write path that forgets to invalidate.
 *
 * Single-instance only — fine for the current deployment. If the API is ever
 * scaled horizontally, move this behind Redis (the wrap/invalidate surface is
 * intentionally small so that swap is mechanical).
 */
@Injectable()
export class PermissionCacheService {
  private readonly store = new Map<string, { value: unknown; expires: number }>();
  private readonly ttlMs = 30_000;
  // Guard against unbounded growth on a long-running process: once we cross
  // this many live keys, sweep expired entries before inserting more.
  private readonly sweepThreshold = 5_000;

  /**
   * Return the cached value for `schoolId`/`key`, or compute it via `fn`,
   * cache it, and return it. Keys are namespaced by school so a single
   * `invalidateSchool` clears every cached check for that tenant.
   */
  async wrap<T>(schoolId: string, key: string, fn: () => Promise<T>): Promise<T> {
    const fullKey = `${schoolId}::${key}`;
    const now = Date.now();
    const hit = this.store.get(fullKey);
    if (hit && hit.expires > now) return hit.value as T;

    const value = await fn();
    if (this.store.size >= this.sweepThreshold) this.sweepExpired(now);
    this.store.set(fullKey, { value, expires: now + this.ttlMs });
    return value;
  }

  /** Drop every cached entry for a tenant. Call after any write that could
   *  change a permission/feature outcome for the school. */
  invalidateSchool(schoolId: string): void {
    const prefix = `${schoolId}::`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  /** Drop the entire cache. Use for platform-level writes (e.g. editing a
   *  package's feature set) that can affect every school on that package. */
  invalidateAll(): void {
    this.store.clear();
  }

  private sweepExpired(now: number): void {
    for (const [k, v] of this.store) {
      if (v.expires <= now) this.store.delete(k);
    }
  }
}
