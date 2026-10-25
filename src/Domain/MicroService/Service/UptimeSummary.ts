import type {
  HealthStatus,
  MicroServiceUptimeSummary,
  UptimeHistorySlot,
} from "../Entity/MicroServiceHealth.js";

// Number of bars shown in the uptime history
export const UPTIME_SLOTS = 30;

/** Period covered by an uptime summary, cut into slots of equal length. */
export interface UptimeWindow {
  since: Date;
  dayAgo: Date;
  until: Date;
  // Start of each slot; a slot ends where the next one starts, the last at `until`
  slotStarts: Date[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Days of 24 hours, whatever the time zone of the server
export function uptimeWindow(days: number, until = new Date()): UptimeWindow {
  const since = new Date(until.getTime() - days * DAY_MS);
  const dayAgo = new Date(until.getTime() - DAY_MS);
  const stepMs = (until.getTime() - since.getTime()) / UPTIME_SLOTS;
  const slotStarts = Array.from(
    { length: UPTIME_SLOTS },
    (_, i) => new Date(since.getTime() + i * stepMs),
  );
  return { since, dayAgo, until, slotStarts };
}

/**
 * Checks of one service since the start of the window, counted per slot.
 * Slot UPTIME_SLOTS holds checks dated after the end of the window: they
 * count in the totals, not in the history.
 */
export interface UptimeSlotCount {
  slot: number;
  checks: number;
  upChecks: number;
  downChecks: number;
  latencySumMs: number;
  // Checks of the last 24 hours
  recentChecks: number;
  recentUpChecks: number;
}

const percentage = (part: number, whole: number, digits: number) =>
  Number(((part / whole) * 100).toFixed(digits));

export function buildUptimeSummary(
  serviceName: string,
  counts: UptimeSlotCount[],
  lastStatus: HealthStatus | undefined,
  window: UptimeWindow,
): MicroServiceUptimeSummary {
  const total = (pick: (count: UptimeSlotCount) => number) =>
    counts.reduce((sum, count) => sum + pick(count), 0);
  const checks = total((c) => c.checks);

  if (checks === 0) {
    return {
      serviceName,
      currentStatus: "NO_DATA",
      uptime24hPercentage: 100,
      uptime30dPercentage: 100,
      averageResponseTimeMs: 0,
      history: [],
    };
  }

  const recentChecks = total((c) => c.recentChecks);
  const history = window.slotStarts.map(
    (timestamp, slot): UptimeHistorySlot => {
      const count = counts.find((c) => c.slot === slot);
      // A slot without a check is shown as such, never as UP (EV-106)
      if (!count) {
        return {
          timestamp,
          status: "NO_DATA",
          responseTimeMs: 0,
          uptimePercentage: 0,
        };
      }
      // DOWN only when every check failed: a service that answers badly is
      // degraded, not stopped
      return {
        timestamp,
        status:
          count.upChecks === count.checks
            ? "UP"
            : count.downChecks === count.checks
              ? "DOWN"
              : "DEGRADED",
        responseTimeMs: Math.round(count.latencySumMs / count.checks),
        uptimePercentage: percentage(count.upChecks, count.checks, 1),
      };
    },
  );

  return {
    serviceName,
    currentStatus: lastStatus ?? "NO_DATA",
    uptime24hPercentage:
      recentChecks > 0
        ? percentage(
            total((c) => c.recentUpChecks),
            recentChecks,
            2,
          )
        : 100,
    uptime30dPercentage: percentage(
      total((c) => c.upChecks),
      checks,
      2,
    ),
    averageResponseTimeMs: Math.round(total((c) => c.latencySumMs) / checks),
    history,
  };
}
