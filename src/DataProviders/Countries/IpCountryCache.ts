const MINUTE_MS = 60 * 1000;

/**
 * How long the country of an address is kept (ADM-N26): a day when the
 * service answered, ten minutes when it failed, so that an outage does not
 * cost one call per visit. The oldest addresses go first past the size.
 */
export const IP_COUNTRY_CACHE_LIMITS = {
  answeredMs: 24 * 60 * MINUTE_MS,
  failedMs: 10 * MINUTE_MS,
  maxAddresses: 5000,
} as const;

/** What the service said about an address: a country, none, or a failure. */
export type IpCountryLookup =
  | { failed: false; countryCode?: string }
  | { failed: true };

interface Entry {
  lookup: IpCountryLookup;
  expiresAt: number;
}

/** The last lookups per address, in memory: the service runs once. */
export class IpCountryCache {
  private readonly entries = new Map<string, Entry>();

  public constructor(
    private readonly limits: {
      answeredMs: number;
      failedMs: number;
      maxAddresses: number;
    } = IP_COUNTRY_CACHE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  public get(address: string): IpCountryLookup | undefined {
    const entry = this.entries.get(address);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(address);
      return undefined;
    }
    return entry.lookup;
  }

  public set(address: string, lookup: IpCountryLookup): void {
    const keptMs = lookup.failed
      ? this.limits.failedMs
      : this.limits.answeredMs;
    // Set again, the address becomes the newest
    this.entries.delete(address);
    this.entries.set(address, { lookup, expiresAt: this.now() + keptMs });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limits.maxAddresses) break;
      this.entries.delete(oldest);
    }
  }

  public get size(): number {
    return this.entries.size;
  }
}
