import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Metric } from "#src/Domain/Metrics/Entity/Metric.js";
import type { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import type { MetricsPeriod } from "#src/Domain/Metrics/Entity/MetricsPeriod.js";
import type { IMetricsRepository } from "#src/Domain/Metrics/Repository/IMetricsRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { BaseRepository } from "../BaseRepository.js";
import { RecentResults } from "../RecentResults.js";

/**
 * Age at which the statistics page is computed again. Measured on 2026-11-16
 * (EV-92), on two processors as the production server: its twelve charts
 * take about 380 ms of PostgreSQL; computed at each opening, they held the
 * twenty connections of the pool from 50 sessions on, and every other screen
 * waited behind them. Kept a minute, the page costs one computation a minute
 * for each period and time zone asked.
 */
const METRICS_MAX_AGE_MS = 60_000;

/**
 * Periods and zones kept at once: the caller chooses them, they must not fill
 * the memory. A page is a few tens of kilobytes.
 */
const METRICS_MAX_ENTRIES = 50;

// Keyed by the ids that get_metrics() gives the dashboard, which sends them
// back to filter a chart; the functions come from migrations 0015, 0018,
// 0026, 0028 and 0030
const METRICS_FUNCTIONS = new Map<string, string>([
  ["overview", `${DB_SCHEMA}.get_overview_metrics(:startDate, :endDate)`],
  [
    "visits_over_time",
    `${DB_SCHEMA}.get_visits_over_time_metrics(:startDate, :endDate)`,
  ],
  [
    "activity_over_time",
    `${DB_SCHEMA}.get_activity_over_time_metrics(:startDate, :endDate)`,
  ],
  ["sign_ins", `${DB_SCHEMA}.get_sign_ins_metrics(:startDate, :endDate)`],
  // Alone, a grid gives UTC hours; the page reads it in its own zone
  // through get_metrics
  [
    "sign_ins_by_hour",
    `${DB_SCHEMA}.get_sign_ins_by_hour_metrics(:startDate, :endDate, 'UTC')`,
  ],
  [
    "visits_by_hour",
    `${DB_SCHEMA}.get_visits_by_hour_metrics(:startDate, :endDate, 'UTC')`,
  ],
  [
    "new_accounts",
    `${DB_SCHEMA}.get_new_accounts_metrics(:startDate, :endDate)`,
  ],
  [
    "daily_visits",
    `${DB_SCHEMA}.get_daily_visits_metrics(:startDate, :endDate)`,
  ],
  [
    "daily_unique_visits",
    `${DB_SCHEMA}.get_daily_unique_visits_metrics(:startDate, :endDate)`,
  ],
  [
    "monthly_visits",
    `${DB_SCHEMA}.get_monthly_visits_metrics(:startDate, :endDate)`,
  ],
  [
    "top_visited_pages",
    `${DB_SCHEMA}.get_top_visited_pages_metrics(:startDate, :endDate)`,
  ],
  [
    "monthly_active_users",
    `${DB_SCHEMA}.get_monthly_active_users_metrics(:startDate, :endDate)`,
  ],
  [
    "monthly_active_projects",
    `${DB_SCHEMA}.get_monthly_active_projects_metrics(:startDate, :endDate)`,
  ],
  [
    "top_languages",
    `${DB_SCHEMA}.get_top_languages_metrics(:startDate, :endDate)`,
  ],
  // Take no period: every year by country, and what the platform holds today
  ["yearly_visits", `${DB_SCHEMA}.get_yearly_visits_metrics()`],
  ["content_overview", `${DB_SCHEMA}.get_content_metrics()`],
  ["models_by_type", `${DB_SCHEMA}.get_models_by_type_metrics()`],
]);

// The call of get_metrics: the last 30 days without a period, and the hours
// of the sign-ins grid in UTC without a time zone
const metricsCallOf = (
  period: MetricsPeriod | undefined,
): { sql: string; replacements: Record<string, string> } => {
  if (!period) {
    return {
      sql: `SELECT ${DB_SCHEMA}.get_metrics() AS data`,
      replacements: {},
    };
  }
  const { startDate, endDate, timeZone } = period;
  if (!timeZone) {
    return {
      sql: `SELECT ${DB_SCHEMA}.get_metrics(:startDate, :endDate) AS data`,
      replacements: { startDate, endDate },
    };
  }
  return {
    sql: `SELECT ${DB_SCHEMA}.get_metrics(:startDate, :endDate, :timeZone) AS data`,
    replacements: { startDate, endDate, timeZone },
  };
};

// A metric as the database functions give it, in the "data" column
interface MetricRow {
  id: string;
  title: string;
  chartType: string;
  defaultFilter: string;
  filters: string[];
  labelKey: string;
  data: object;
}

export class MetricsRepositoryImpl
  extends BaseRepository
  implements IMetricsRepository
{
  private readonly recentPages: RecentResults<MetricRow[]>;

  public constructor(config: { maxAgeMs?: number; now?: () => number } = {}) {
    super();
    this.recentPages = new RecentResults(
      config.maxAgeMs ?? METRICS_MAX_AGE_MS,
      config.now ?? Date.now,
      METRICS_MAX_ENTRIES,
    );
  }

  /**
   * Reads the metric definitions and their data from the database, kept
   * METRICS_MAX_AGE_MS for the same period and time zone: the dashboard
   * shows the figures of the last minute, not those of the last restart.
   */
  public async getMetrics(
    request: RequestModel<MetricsPeriod | undefined>,
  ): Promise<ResponseModel<Metric[]>> {
    const response = new ResponseModel<Metric[]>(request.transactionId);
    const period = request.data;

    try {
      const { sql, replacements } = metricsCallOf(period);
      // The same call gives the same key: the SQL names the arguments given
      const key = JSON.stringify([sql, replacements]);
      const rows = await this.recentPages.get(key, () =>
        VARIAMOS_ORM.query<{ data?: MetricRow[] }>(sql, {
          type: QueryTypes.SELECT,
          replacements,
        }).then(([resObj]) => resObj?.data ?? []),
      );
      response.data = rows.map(
        ({ id, title, chartType, defaultFilter, filters, labelKey, data }) =>
          Metric.builder()
            .setId(id)
            .setTitle(title)
            .setChartType(chartType)
            .setDefaultFilter(defaultFilter)
            .setFilters(filters)
            .setLabelKey(labelKey)
            .setData(data)
            .build(),
      );
    } catch (error) {
      logger.err("Error in getMetrics:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async queryMetric(
    request: RequestModel<MetricsFilter>,
  ): Promise<ResponseModel<Metric>> {
    const response = new ResponseModel<Metric>(request.transactionId);

    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Metrics filter is required.",
        );
      }
      const replacements = this.initializeReplacements(data);

      const selectedFunction = METRICS_FUNCTIONS.get(String(replacements.id));

      if (!selectedFunction) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Invalid metric id",
        );
      }

      const result = await VARIAMOS_ORM.query<{ data?: MetricRow }>(
        `SELECT ${selectedFunction} AS data`,
        {
          type: QueryTypes.SELECT,
          replacements,
        },
      ).then(([resObj]) => {
        if (!resObj?.data) throw new Error("Invalid database response format");
        const {
          id,
          title,
          chartType,
          defaultFilter,
          filters,
          labelKey,
          data: dataField,
        } = resObj.data;

        return Metric.builder()
          .setId(id)
          .setTitle(title)
          .setChartType(chartType)
          .setDefaultFilter(defaultFilter)
          .setFilters(filters)
          .setLabelKey(labelKey)
          .setData(dataField)
          .build();
      });

      response.data = result;
    } catch (error) {
      logger.err("Error in queryMetric:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}
