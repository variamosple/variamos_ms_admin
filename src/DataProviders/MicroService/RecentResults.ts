/**
 * Keeps each result for `maxAgeMs` after it was asked for. Callers that ask
 * for the same key in that time, even while it is computed, share one
 * computation. A computation that fails is not kept: the next caller tries
 * again.
 */
export class RecentResults<T> {
  private readonly entries = new Map<
    string,
    { askedAt: number; result: Promise<T> }
  >();

  public constructor(
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  public get(key: string, compute: () => Promise<T>): Promise<T> {
    const now = this.now();
    const entry = this.entries.get(key);
    if (entry && now - entry.askedAt < this.maxAgeMs) return entry.result;

    // Expired keys go at each computation: only the keys asked for during
    // the last maxAgeMs stay in memory
    for (const [other, { askedAt }] of this.entries) {
      if (now - askedAt >= this.maxAgeMs) this.entries.delete(other);
    }
    const result = compute();
    this.entries.set(key, { askedAt: now, result });
    result.catch(() => {
      if (this.entries.get(key)?.result === result) this.entries.delete(key);
    });
    return result;
  }
}
