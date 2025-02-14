import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Metric } from "@src/Domain/Metrics/Entity/Metric";
import { MetricsFilter } from "@src/Domain/Metrics/Entity/MetricsFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { BaseRepository } from "../BaseRepository";

const METRICS_FUNCTIONS = new Map<string, string>()
  .set(
    "daily_unique_visits",
    "variamos.get_daily_unique_visits_metrics((:startDate)::DATE, (:endDate)::DATE)"
  )
  .set(
    "daily_visits",
    "variamos.get_daily_visits_metrics((:startDate)::DATE, (:endDate)::DATE)"
  )
  .set(
    "monthly_visits",
    "variamos.get_monthly_visits_metrics((:startDate)::DATE, (:endDate)::DATE)"
  );

export class MetricsRepositoryImpl extends BaseRepository {
  private metrics: Metric[] = [];
  private metricsRefreshInterval: number = 1000 * 60 * 60; // 1 hour

  constructor() {
    super();

    setTimeout(async () => this.loadMetrics().then(), 10000);
    setInterval(this.loadMetrics, this.metricsRefreshInterval);
  }

  private async loadMetrics() {
    logger.info("Refreshing metrics...");

    try {
      this.metrics = await VARIAMOS_ORM.query(
        "SELECT variamos.get_metrics() AS data",
        {
          type: QueryTypes.SELECT,
        }
      ).then(([result]: any) =>
        result.data.map(
          ({
            id,
            title,
            chartType,
            defaultFilter,
            filters,
            labelKey,
            data,
          }: any) =>
            Metric.builder()
              .setId(id)
              .setTitle(title)
              .setChartType(chartType)
              .setDefaultFilter(defaultFilter)
              .setFilters(filters)
              .setLabelKey(labelKey)
              .setData(data)
              .build()
        )
      );

      logger.info("Metrics refreshed...");
    } catch (error) {
      logger.err("Error in loadMetrics:");
      logger.err(error);
    }
  }

  async getMetrics(
    request: RequestModel<any>
  ): Promise<ResponseModel<Metric[]>> {
    const response = new ResponseModel<Metric[]>(request.transactionId);

    try {
      response.data = [...this.metrics];
    } catch (error) {
      logger.err("Error in getMetrics:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async queryMetric(
    request: RequestModel<MetricsFilter>
  ): Promise<ResponseModel<Metric>> {
    const response = new ResponseModel<Metric>(request.transactionId);

    try {
      const replacements = this.initilizeReplacements(request.data!);

      const selectedFunction = METRICS_FUNCTIONS.get(replacements.id);

      if (!selectedFunction) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Invalid metric id"
        );
      }

      const result = await VARIAMOS_ORM.query(
        `SELECT ${selectedFunction} AS data`,
        {
          type: QueryTypes.SELECT,
          replacements,
        }
      ).then(([result]: any) => {
        const { id, title, chartType, defaultFilter, filters, labelKey, data } =
          result.data;

        console.log(result.data);
        return Metric.builder()
          .setId(id)
          .setTitle(title)
          .setChartType(chartType)
          .setDefaultFilter(defaultFilter)
          .setFilters(filters)
          .setLabelKey(labelKey)
          .setData(data)
          .build();
      });

      response.data = result;
    } catch (error) {
      logger.err("Error in queryMetric:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }
}

export const MetricsRepositoryInstance = new MetricsRepositoryImpl();
