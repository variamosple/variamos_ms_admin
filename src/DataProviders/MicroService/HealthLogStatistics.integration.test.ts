import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  HealthStatus,
  MicroServiceUptimeSummary,
  UptimeHistorySlot,
} from "#src/Domain/MicroService/Entity/MicroServiceHealth.js";
import {
  buildUptimeSummary,
  type UptimeWindow,
  uptimeWindow,
} from "#src/Domain/MicroService/Service/UptimeSummary.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { HealthLogStatistics } from "./HealthLogStatistics.js";

// Needs a disposable PostgreSQL, as the migration tests (Migrator.integration.test.ts)
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t29_health";

interface Log {
  serviceName: string;
  status: HealthStatus;
  responseTimeMs: number;
  checkedAt: Date;
}

// Computation done in JavaScript on every row before EV-101, kept as the
// reference: SQL must give the same figures (empty slots aside, EV-106)
function referenceSummary(
  serviceName: string,
  allLogs: Log[],
  window: UptimeWindow,
): MicroServiceUptimeSummary {
  const logs = allLogs
    .filter((l) => l.serviceName === serviceName && l.checkedAt >= window.since)
    .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
  if (logs.length === 0) {
    return {
      serviceName,
      currentStatus: "NO_DATA",
      uptime24hPercentage: 100,
      uptime30dPercentage: 100,
      averageResponseTimeMs: 0,
      history: [],
    };
  }
  const upLogs = logs.filter((l) => l.status === "UP");
  const recentLogs = logs.filter((l) => l.checkedAt >= window.dayAgo);
  const recentUpLogs = recentLogs.filter((l) => l.status === "UP");
  const stepMs = (window.until.getTime() - window.since.getTime()) / 30;
  const history: UptimeHistorySlot[] = [];
  for (let i = 0; i < 30; i++) {
    const slotStart = new Date(window.since.getTime() + i * stepMs);
    const slotEnd = new Date(window.since.getTime() + (i + 1) * stepMs);
    const slotLogs = logs.filter(
      (l) => l.checkedAt >= slotStart && l.checkedAt < slotEnd,
    );
    if (slotLogs.length === 0) {
      history.push({
        timestamp: slotStart,
        status: "NO_DATA",
        responseTimeMs: 0,
        uptimePercentage: 0,
      });
      continue;
    }
    const slotUp = slotLogs.filter((l) => l.status === "UP");
    history.push({
      timestamp: slotStart,
      status:
        slotUp.length === slotLogs.length
          ? "UP"
          : slotUp.length > 0
            ? "DEGRADED"
            : "DOWN",
      responseTimeMs: Math.round(
        slotLogs.reduce((acc, l) => acc + l.responseTimeMs, 0) /
          slotLogs.length,
      ),
      uptimePercentage: Number(
        ((slotUp.length / slotLogs.length) * 100).toFixed(1),
      ),
    });
  }
  return {
    serviceName,
    currentStatus: logs[logs.length - 1]?.status ?? "NO_DATA",
    uptime24hPercentage:
      recentLogs.length > 0
        ? Number(((recentUpLogs.length / recentLogs.length) * 100).toFixed(2))
        : 100,
    uptime30dPercentage: Number(
      ((upLogs.length / logs.length) * 100).toFixed(2),
    ),
    averageResponseTimeMs: Math.round(
      logs.reduce((acc, l) => acc + l.responseTimeMs, 0) / logs.length,
    ),
    history,
  };
}

// Daily rows as the former JavaScript aggregation computed them
function referenceDailyStats(logs: Log[], from: Date, to: Date) {
  const groups = new Map<string, Log[]>();
  for (const log of logs) {
    if (log.checkedAt < from || log.checkedAt >= to) continue;
    const key = `${log.serviceName}_${log.checkedAt.toISOString().split("T")[0]}`;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const up = group.filter((l) => l.status === "UP").length;
      const degraded = group.filter((l) => l.status === "DEGRADED").length;
      return {
        key,
        uptimePercentage: Number(((up / group.length) * 100).toFixed(2)),
        avgLatencyMs: Math.round(
          group.reduce((acc, l) => acc + l.responseTimeMs, 0) / group.length,
        ),
        totalChecks: group.length,
        successfulChecks: up,
        degradedChecks: degraded,
        failedChecks: group.length - up - degraded,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Same data at each run
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const until = new Date("2026-10-25T12:00:00.000Z");
const window = uptimeWindow(30, until);

function dataset(): Log[] {
  const next = random(29);
  const logs: Log[] = [];
  const status = (): HealthStatus => {
    const draw = next();
    return draw < 0.9 ? "UP" : draw < 0.95 ? "DEGRADED" : "DOWN";
  };
  const add = (serviceName: string, at: number, forced?: HealthStatus) =>
    logs.push({
      serviceName,
      status: forced ?? status(),
      responseTimeMs: 1 + Math.floor(next() * 500),
      checkedAt: new Date(at),
    });

  // From before the window to after its end, every 20 minutes
  for (
    let at = until.getTime() - 32 * DAY;
    at < until.getTime() + 60 * MINUTE;
    at += 20 * MINUTE
  ) {
    add("ms_steady", at + Math.floor(next() * MINUTE));
    const gapsAt = at + 1 + Math.floor(next() * MINUTE);
    const day = Math.floor((until.getTime() - gapsAt) / DAY);
    // Five days without a check, a day down and a day up
    if (day < 10 || day > 14) {
      add(
        "ms_gaps",
        gapsAt,
        day === 20 ? "DOWN" : day === 25 ? "UP" : undefined,
      );
    }
    // On the slot and day edges
    add("ms_other", at);
  }
  // Checked only before the window
  add("ms_gone", until.getTime() - 31 * DAY);
  // On the edges: the start of the window, of a slot, and its end
  add("ms_steady", window.since.getTime());
  add("ms_steady", window.slotStarts[5]?.getTime() ?? 0);
  add("ms_steady", until.getTime());
  return logs;
}

describe.skipIf(!url)("Health log statistics on PostgreSQL", () => {
  let sequelize: Sequelize;
  let statistics: HealthLogStatistics;
  const logs = dataset();

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    await sequelize.query(
      `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY)`,
    );
    const migrations = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(migrations, SCHEMA);
    } finally {
      await migrations.close();
    }
    await sequelize.getQueryInterface().bulkInsert(
      { tableName: "microservice_health_logs", schema: SCHEMA },
      logs.map((l) => ({
        service_name: l.serviceName,
        status: l.status,
        response_time_ms: l.responseTimeMs,
        checked_at: l.checkedAt,
      })),
    );
    statistics = new HealthLogStatistics(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.close();
  });

  it("gives the uptime the former computation gave, per service", async () => {
    const names = ["ms_steady", "ms_gaps", "ms_gone", "ms_never", "ms_other"];

    const [counts, lastStatuses] = await Promise.all([
      statistics.uptimeCounts(names, window),
      statistics.lastStatuses(names, window.since),
    ]);
    const summaries = names.map((name) =>
      buildUptimeSummary(
        name,
        counts.get(name) ?? [],
        lastStatuses.get(name),
        window,
      ),
    );

    expect(summaries).toEqual(
      names.map((name) => referenceSummary(name, logs, window)),
    );
    // The data covers what the comparison is meant to prove
    const [steady, gaps, gone] = summaries;
    expect(steady?.history.map((slot) => slot.status)).toContain("DEGRADED");
    expect(gaps?.history.map((slot) => slot.status)).toEqual(
      expect.arrayContaining(["NO_DATA", "DOWN", "UP"]),
    );
    expect(gone?.currentStatus).toBe("NO_DATA");
  });

  it("returns nothing without a service", async () => {
    expect(await statistics.uptimeCounts([], window)).toEqual(new Map());
    expect(await statistics.lastStatuses([], window.since)).toEqual(new Map());
  });

  it("saves the daily rows the former computation saved, once", async () => {
    const from = new Date("2026-09-26T00:00:00.000Z");
    const to = new Date("2026-10-25T00:00:00.000Z");
    const savedRows = async () =>
      (
        await sequelize.query<{
          service_name: string;
          stat_date: string;
          uptime_percentage: string;
          avg_latency_ms: number;
          total_checks: number;
          successful_checks: number;
          degraded_checks: number;
          failed_checks: number;
        }>(
          `SELECT * FROM "${SCHEMA}"."microservice_daily_stats"
            ORDER BY service_name, stat_date`,
          { type: QueryTypes.SELECT },
        )
      ).map((row) => ({
        key: `${row.service_name}_${row.stat_date}`,
        uptimePercentage: Number(row.uptime_percentage),
        avgLatencyMs: row.avg_latency_ms,
        totalChecks: row.total_checks,
        successfulChecks: row.successful_checks,
        degradedChecks: row.degraded_checks,
        failedChecks: row.failed_checks,
      }));

    const expected = referenceDailyStats(logs, from, to);
    expect(await statistics.aggregateDays(from, to)).toBe(expected.length);
    expect(await savedRows()).toEqual(expected);

    // The next run keeps the rows already saved
    expect(await statistics.aggregateDays(from, to)).toBe(0);
    expect(await savedRows()).toEqual(expected);
  });
});
