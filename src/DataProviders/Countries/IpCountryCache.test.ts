import { IP_COUNTRY_CACHE_LIMITS, IpCountryCache } from "./IpCountryCache.js";

const clock = () => {
  let now = 1_000_000;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("IpCountryCache (ADM-N26)", () => {
  it("keeps a country a day, a failure ten minutes, 5000 addresses", () => {
    expect(IP_COUNTRY_CACHE_LIMITS).toEqual({
      answeredMs: 24 * 60 * 60 * 1000,
      failedMs: 10 * 60 * 1000,
      maxAddresses: 5000,
    });
  });

  it("gives back an answer until it expires", () => {
    const time = clock();
    const cache = new IpCountryCache(
      { answeredMs: 1000, failedMs: 100, maxAddresses: 10 },
      time.now,
    );
    cache.set("203.0.113.7", { failed: false, countryCode: "CO" });

    time.advance(999);
    expect(cache.get("203.0.113.7")).toEqual({
      failed: false,
      countryCode: "CO",
    });
    time.advance(1);
    expect(cache.get("203.0.113.7")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("keeps a failure for a shorter time", () => {
    const time = clock();
    const cache = new IpCountryCache(
      { answeredMs: 1000, failedMs: 100, maxAddresses: 10 },
      time.now,
    );
    cache.set("203.0.113.7", { failed: true });

    time.advance(99);
    expect(cache.get("203.0.113.7")).toEqual({ failed: true });
    time.advance(1);
    expect(cache.get("203.0.113.7")).toBeUndefined();
  });

  it("drops the oldest address past its size", () => {
    const cache = new IpCountryCache({
      answeredMs: 1000,
      failedMs: 100,
      maxAddresses: 2,
    });
    cache.set("203.0.113.1", { failed: false, countryCode: "CO" });
    cache.set("203.0.113.2", { failed: false, countryCode: "FR" });
    // Set again, the first one becomes the newest
    cache.set("203.0.113.1", { failed: false, countryCode: "CO" });
    cache.set("203.0.113.3", { failed: false });

    expect(cache.size).toBe(2);
    expect(cache.get("203.0.113.2")).toBeUndefined();
    expect(cache.get("203.0.113.1")).toBeDefined();
    expect(cache.get("203.0.113.3")).toEqual({ failed: false });
  });
});
