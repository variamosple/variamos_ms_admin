import { Op, QueryTypes, type Sequelize } from "sequelize";
import type { HealthStatus } from "#src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IHealthLogArchive } from "#src/Domain/MicroService/Repository/IHealthLogArchive.js";
import type {
  UptimeSlotCount,
  UptimeWindow,
} from "#src/Domain/MicroService/Service/UptimeSummary.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";

/**
 * Statistics computed by PostgreSQL from the health checks (EV-101): the
 * rows stay in the database, only the counts reach the service.
 */
export class HealthLogStatistics implements IHealthLogArchive {
  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }

  /** Checks of each service since the start of the window, per slot. */
  public async uptimeCounts(
    serviceNames: string[],
    window: UptimeWindow,
  ): Promise<Map<string, UptimeSlotCount[]>> {
    const counts = new Map<string, UptimeSlotCount[]>();
    if (serviceNames.length === 0) return counts;

    // width_bucket gives the number of slot ends at or before the check: the
    // index of its slot, UPTIME_SLOTS after the end of the window
    const rows = await this.sequelize.query<
      UptimeSlotCount & { serviceName: string }
    >(
      `SELECT service_name AS "serviceName",
              width_bucket(checked_at, ARRAY[:slotEnds]::timestamp with time zone[]) AS "slot",
              count(*)::int AS "checks",
              count(*) FILTER (WHERE status = 'UP')::int AS "upChecks",
              count(*) FILTER (WHERE status = 'DOWN')::int AS "downChecks",
              sum(response_time_ms)::float8 AS "latencySumMs",
              count(*) FILTER (WHERE checked_at >= :dayAgo)::int AS "recentChecks",
              count(*) FILTER (WHERE checked_at >= :dayAgo AND status = 'UP')::int
                AS "recentUpChecks"
         FROM ${this.table("microservice_health_logs")}
        WHERE service_name IN (:serviceNames) AND checked_at >= :since
        GROUP BY 1, 2`,
      {
        replacements: {
          serviceNames,
          since: window.since,
          dayAgo: window.dayAgo,
          slotEnds: [...window.slotStarts.slice(1), window.until],
        },
        type: QueryTypes.SELECT,
      },
    );
    for (const { serviceName, ...count } of rows) {
      counts.set(serviceName, [...(counts.get(serviceName) ?? []), count]);
    }
    return counts;
  }

  /** Status of the last check of each service since `since`. */
  public async lastStatuses(
    serviceNames: string[],
    since: Date,
  ): Promise<Map<string, HealthStatus>> {
    if (serviceNames.length === 0) return new Map();
    // One index lookup per service, instead of sorting all their checks
    const rows = await this.sequelize.query<{
      serviceName: string;
      status: HealthStatus;
    }>(
      `SELECT name AS "serviceName", last.status
         FROM unnest(ARRAY[:serviceNames]::text[]) AS name
        CROSS JOIN LATERAL (
              SELECT status
                FROM ${this.table("microservice_health_logs")}
               WHERE service_name = name AND checked_at >= :since
               ORDER BY checked_at DESC, id DESC
               LIMIT 1
             ) AS last`,
      { replacements: { serviceNames, since }, type: QueryTypes.SELECT },
    );
    return new Map(rows.map((row) => [row.serviceName, row.status]));
  }

  /**
   * Saves one row per service and day (UTC) for the days in [from, to) that
   * have none yet; returns the number of rows saved.
   */
  public async aggregateDays(from: Date, to: Date): Promise<number> {
    const saved = await this.sequelize.query(
      `INSERT INTO ${this.table("microservice_daily_stats")}
              (service_name, stat_date, uptime_percentage, avg_latency_ms,
               total_checks, successful_checks, degraded_checks, failed_checks,
               created_at)
       SELECT service_name,
              (checked_at AT TIME ZONE 'UTC')::date,
              round(100.0 * count(*) FILTER (WHERE status = 'UP') / count(*), 2),
              round(avg(response_time_ms))::int,
              count(*),
              count(*) FILTER (WHERE status = 'UP'),
              count(*) FILTER (WHERE status = 'DEGRADED'),
              count(*) FILTER (WHERE status NOT IN ('UP', 'DEGRADED')),
              now() AT TIME ZONE 'UTC'
         FROM ${this.table("microservice_health_logs")}
        WHERE checked_at >= :from AND checked_at < :to
        GROUP BY 1, 2
       ON CONFLICT (service_name, stat_date) DO NOTHING
       RETURNING id`,
      { replacements: { from, to }, type: QueryTypes.SELECT },
    );
    return saved.length;
  }

  public async purgeChecksBefore(cutoff: Date): Promise<number> {
    return MicroServiceHealthLogModel.destroy({
      where: { checkedAt: { [Op.lt]: cutoff } },
    });
  }
}
