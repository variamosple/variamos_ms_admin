import {
  buildUptimeSummary,
  UPTIME_SLOTS,
  type UptimeSlotCount,
  uptimeWindow,
} from "./UptimeSummary.js";

const until = new Date("2026-10-25T12:00:00.000Z");
const window = uptimeWindow(30, until);

interface SlotChecks {
  checks: number;
  upChecks: number;
  latencySumMs: number;
  recent?: { checks: number; up: number };
  // Checks neither UP nor DOWN are DEGRADED
  downChecks?: number;
}

const count = (
  slot: number,
  {
    checks,
    upChecks,
    latencySumMs,
    recent = { checks: 0, up: 0 },
    downChecks = checks - upChecks,
  }: SlotChecks,
): UptimeSlotCount => ({
  slot,
  checks,
  upChecks,
  downChecks,
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
      [
        count(3, {
          checks: 2,
          upChecks: 2,
          latencySumMs: 30,
        }),
      ],
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
      [
        count(0, {
          checks: 3,
          upChecks: 2,
          latencySumMs: 100,
        }),
        count(1, {
          checks: 2,
          upChecks: 0,
          latencySumMs: 9,
        }),
        count(2, {
          checks: 1,
          upChecks: 1,
          latencySumMs: 7,
        }),
      ],
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

  it("shows a slot without a successful check as DOWN only when every check failed", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [
        count(0, {
          checks: 2,
          upChecks: 0,
          latencySumMs: 10,
          downChecks: 0,
        }),
        count(1, {
          checks: 3,
          upChecks: 0,
          latencySumMs: 15,
          downChecks: 1,
        }),
        count(2, {
          checks: 2,
          upChecks: 0,
          latencySumMs: 10,
          downChecks: 2,
        }),
      ],
      "DOWN",
      window,
    );

    expect(
      summary.history
        .slice(0, 3)
        .map(({ status, uptimePercentage }) => ({ status, uptimePercentage })),
    ).toEqual([
      { status: "DEGRADED", uptimePercentage: 0 },
      { status: "DEGRADED", uptimePercentage: 0 },
      { status: "DOWN", uptimePercentage: 0 },
    ]);
  });

  it("counts every check in the totals, those after the window too", () => {
    const summary = buildUptimeSummary(
      "ms_auth",
      [
        count(28, {
          checks: 2,
          upChecks: 1,
          latencySumMs: 10,
          recent: { checks: 1, up: 1 },
        }),
        count(29, {
          checks: 1,
          upChecks: 0,
          latencySumMs: 5,
          recent: { checks: 1, up: 0 },
        }),
        count(UPTIME_SLOTS, {
          checks: 3,
          upChecks: 3,
          latencySumMs: 30,
          recent: { checks: 3, up: 3 },
        }),
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
      [
        count(0, {
          checks: 1,
          upChecks: 0,
          latencySumMs: 1,
        }),
      ],
      "DOWN",
      window,
    );

    expect(summary.uptime24hPercentage).toBe(100);
    expect(summary.uptime30dPercentage).toBe(0);
  });
});
