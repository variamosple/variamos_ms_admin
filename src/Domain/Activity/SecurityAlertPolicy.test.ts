import { SecurityAlertPolicy } from "./SecurityAlertPolicy.js";

const MINUTE_MS = 60 * 1000;

describe("SecurityAlertPolicy", () => {
  it("takes the configured values within their bounds", () => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      failedSignInsMax: 5,
      failedSignInsWindowMinutes: 30,
      massOperationsMax: 50,
      massOperationsWindowMinutes: 5,
      cooldownMinutes: 120,
    });

    expect(policy.failedSignIns).toEqual({ max: 5, windowMs: 30 * MINUTE_MS });
    expect(policy.massOperations).toEqual({ max: 50, windowMs: 5 * MINUTE_MS });
    expect(policy.cooldownMs).toBe(120 * MINUTE_MS);
  });

  it.each([
    ["below its bound", 2],
    ["above its bound", 1001],
    ["not an integer", 7.5],
    ["not a number", "12"],
    ["missing", undefined],
  ])("takes the default for a value %s", (_case, value) => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      failedSignInsMax: value,
      cooldownMinutes: value === undefined ? undefined : 2000,
    });

    expect(policy.failedSignIns.max).toBe(
      SecurityAlertPolicy.DEFAULT.failedSignIns.max,
    );
    expect(policy.cooldownMs).toBe(SecurityAlertPolicy.DEFAULT.cooldownMs);
  });

  it("leaves the off-hours alert off by default and for a malformed span", () => {
    const at = new Date("2026-10-26T03:00:00Z");

    expect(SecurityAlertPolicy.DEFAULT.isOffHours(at)).toBe(false);
    for (const offHours of ["", "8-18", "25:00-07:00", "20:00-20:00", 20]) {
      expect(
        SecurityAlertPolicy.fromConfiguration({ offHours }).isOffHours(at),
      ).toBe(false);
    }
  });

  it("checks a span within the day", () => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      offHours: "12:00-14:00",
    });

    expect(policy.isOffHours(new Date("2026-10-26T11:59:00Z"))).toBe(false);
    expect(policy.isOffHours(new Date("2026-10-26T12:00:00Z"))).toBe(true);
    expect(policy.isOffHours(new Date("2026-10-26T14:00:00Z"))).toBe(false);
  });

  it("checks a span past midnight", () => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      offHours: "20:00-07:00",
    });

    expect(policy.isOffHours(new Date("2026-10-26T21:00:00Z"))).toBe(true);
    expect(policy.isOffHours(new Date("2026-10-26T06:59:00Z"))).toBe(true);
    expect(policy.isOffHours(new Date("2026-10-26T07:00:00Z"))).toBe(false);
    expect(policy.isOffHours(new Date("2026-10-26T19:59:00Z"))).toBe(false);
  });

  it("reads the span in the configured time zone, UTC when it is unknown", () => {
    // 03:00 UTC is 22:00 the day before in Bogota (UTC-5)
    const at = new Date("2026-10-26T03:00:00Z");
    const span = "21:00-23:00";

    expect(
      SecurityAlertPolicy.fromConfiguration({
        offHours: span,
        timeZone: "America/Bogota",
      }).isOffHours(at),
    ).toBe(true);
    expect(
      SecurityAlertPolicy.fromConfiguration({
        offHours: span,
        timeZone: "Not/AZone",
      }).isOffHours(at),
    ).toBe(false);
  });
});
