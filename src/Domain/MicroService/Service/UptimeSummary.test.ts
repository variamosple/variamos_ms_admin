import {
  buildUptimeSummary,
  UPTIME_SLOTS,
  type UptimeSlotCount,
  uptimeWindow,
} from "./UptimeSummary.js";

const until = new Date("2026-10-25T12:00:00.000Z");
const window = uptimeWindow(30, until);

const count = (
  slot: number,
  checks: number,
  upChecks: number,
  latencySumMs: number,
  recent: { checks: number; up: number } = { checks: 0, up: 0 },
): UptimeSlotCount => ({
  slot,
  checks,
  upChecks,
  latencySumMs,
  recentChecks: recent.checks,
  recentUpChecks: recent.up,
});

describe("uptimeWindow", () => {
  it("cuts the last days into slots of equal length", () => {
    expect(window.until).toEqual(until);
    expect(window.since).toEqual(new Date("2026-09-25T12:00:00.000Z"));
    expect(window.dayAgo).toEqual(new Date("2026-10-24T12:00:00.000Z"));
    expect(window.slotStarts).toHaveLength(UPTIME_SLOTS);
    expect(window.slotStarts[0]).toEqual(window.since);
    expect(window.slotStarts[29]).toEqual(new Date("2026-10-24T12:00:00.000Z"));
  });
});

describe("buildUptimeSummary", () => {
  it("shows NO_DATA without any check", () => {
    expect(buildUptimeSummary("ms_auth", [], undefined, window)).toEqual({
      serviceName: "ms_auth",
      currentStatus: "NO_DATA",
      uptime24hPercentage: 100,
      uptime30dPercentage: 100,
      averageResponseTimeMs: 0,
      history: [],
    });
  });

  it("shows a slot without a check as NO_DATA, never as UP (EV-106)", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [count(3, 2, 2, 30)],
      "UP",
      window,
    );

    expect(summary.history).toHaveLength(UPTIME_SLOTS);
    expect(summary.history[0]).toEqual({
      timestamp: window.slotStarts[0],
      status: "NO_DATA",
      responseTimeMs: 0,
      uptimePercentage: 0,
    });
    expect(summary.history[3]?.status).toBe("UP");
  });

  it("gives each slot its status, uptime and mean latency", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [count(0, 3, 2, 100), count(1, 2, 0, 9), count(2, 1, 1, 7)],
      "UP",
      window,
    );

    expect(summary.history.slice(0, 3)).toEqual([
      {
        timestamp: window.slotStarts[0],
        status: "DEGRADED",
        responseTimeMs: 33,
        uptimePercentage: 66.7,
      },
      {
        timestamp: window.slotStarts[1],
        status: "DOWN",
        responseTimeMs: 5,
        uptimePercentage: 0,
      },
      {
        timestamp: window.slotStarts[2],
        status: "UP",
        responseTimeMs: 7,
        uptimePercentage: 100,
      },
    ]);
  });

  it("counts every check in the totals, those after the window too", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [
        count(28, 2, 1, 10, { checks: 1, up: 1 }),
        count(29, 1, 0, 5, { checks: 1, up: 0 }),
        count(UPTIME_SLOTS, 3, 3, 30, { checks: 3, up: 3 }),
      ],
      "DOWN",
      window,
    );

    expect(summary).toMatchObject({
      currentStatus: "DOWN",
      uptime24hPercentage: 80,
      uptime30dPercentage: 66.67,
      averageResponseTimeMs: 8,
    });
    expect(summary.history).toHaveLength(UPTIME_SLOTS);
  });

  it("shows 100 % over 24 hours without a recent check", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [count(0, 1, 0, 1)],
      "DOWN",
      window,
    );

    expect(summary.uptime24hPercentage).toBe(100);
    expect(summary.uptime30dPercentage).toBe(0);
  });
});
