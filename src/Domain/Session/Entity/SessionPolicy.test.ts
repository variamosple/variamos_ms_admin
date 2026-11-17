import { describe, expect, it } from "vitest";
import { SessionPolicy, type SessionRecord } from "./SessionPolicy.js";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-17T12:00:00Z");

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  userId: "u-1",
  startedAt: new Date(NOW - HOUR),
  lastSeenAt: new Date(NOW - 60_000),
  revokedAt: null,
  ...overrides,
});

describe("SessionPolicy", () => {
  it("lasts 60 idle minutes and 12 hours by default", () => {
    expect(SessionPolicy.DEFAULT).toMatchObject({
      idleMinutes: 60,
      maxHours: 12,
    });
    expect(SessionPolicy.DEFAULT.idleMs).toBe(HOUR);
    expect(SessionPolicy.DEFAULT.maxMs).toBe(12 * HOUR);
  });

  it("takes the configured values within their bounds", () => {
    expect(
      SessionPolicy.fromConfiguration({ idleMinutes: 5, maxHours: 720 }),
    ).toMatchObject({ idleMinutes: 5, maxHours: 720 });
    expect(
      SessionPolicy.fromConfiguration({ idleMinutes: 1440, maxHours: 1 }),
    ).toMatchObject({ idleMinutes: 1440, maxHours: 1 });
  });

  it.each([
    [4, 0],
    [1441, 721],
    [30.5, 2.5],
    ["30", "8"],
    [undefined, undefined],
    [null, null],
  ])("takes the default for %j and %j", (idleMinutes, maxHours) => {
    expect(
      SessionPolicy.fromConfiguration({ idleMinutes, maxHours }),
    ).toMatchObject({ idleMinutes: 60, maxHours: 12 });
  });

  it("accepts an open session of the account", () => {
    expect(SessionPolicy.DEFAULT.refusalOf(record(), "u-1", NOW)).toBeNull();
  });

  it("knows no session, nor the session of another account", () => {
    const policy = SessionPolicy.DEFAULT;
    expect(policy.refusalOf(null, "u-1", NOW)).toBe("unknown");
    expect(policy.refusalOf(record(), "u-2", NOW)).toBe("unknown");
  });

  it("refuses a revoked session first", () => {
    expect(
      SessionPolicy.DEFAULT.refusalOf(
        record({ revokedAt: new Date(NOW), startedAt: new Date(0) }),
        "u-1",
        NOW,
      ),
    ).toBe("revoked");
  });

  it("ends a session past its longest duration, however active", () => {
    const policy = SessionPolicy.DEFAULT;
    const started = (ms: number) =>
      record({ startedAt: new Date(NOW - ms), lastSeenAt: new Date(NOW) });
    expect(policy.refusalOf(started(12 * HOUR), "u-1", NOW)).toBeNull();
    expect(policy.refusalOf(started(12 * HOUR + 1), "u-1", NOW)).toBe(
      "too_old",
    );
  });

  it("ends a session idle past the delay", () => {
    const policy = SessionPolicy.DEFAULT;
    const seen = (ms: number) => record({ lastSeenAt: new Date(NOW - ms) });
    expect(policy.refusalOf(seen(HOUR), "u-1", NOW)).toBeNull();
    expect(policy.refusalOf(seen(HOUR + 1), "u-1", NOW)).toBe("idle");
  });
});
