import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Metric } from "@src/Domain/Metrics/Entity/Metric";
import { MetricsFilter } from "@src/Domain/Metrics/Entity/MetricsFilter";
import { IMetricsRepository } from "@src/Domain/Metrics/Repository/IMetricsRepository";
import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { BaseRepository } from "../BaseRepository";

const METRICS_FUNCTIONS = new Map<string, string>([
  ["visitsByDay", "${DB_SCHEMA}.get_visits_by_day()"],
  ["visitsByUser", "${DB_SCHEMA}.get_visits_by_user()"],
  ["operationsCount", "${DB_SCHEMA}.get_operations_count()"],
  ["activeUsers", "${DB_SCHEMA}.get_active_users()"],
  ["activeUsersCount", "${DB_SCHEMA}.get_active_users_count()"],
  ["operationsBySystem", "${DB_SCHEMA}.get_operations_by_system()"],
  ["averageExecutionTime", "${DB_SCHEMA}.get_average_execution_time()"],
  ["errorRate", "${DB_SCHEMA}.get_error_rate()"],
  ["errorRateBySystem", "${DB_SCHEMA}.get_error_rate_by_system()"],
]);

export class MetricsRepositoryImpl extends BaseRepository implements IMetricsRepository {
  private metrics: Metric[] = [];

  public constructor() {
    super();
    void this.loadMetrics();
  }

  private async loadMetrics() {
    logger.info("Refreshing metrics...");

    try {
      this.metrics = await VARIAMOS_ORM.query("SELECT ${DB_SCHEMA}.get_metrics() AS data", {
        type: QueryTypes.SELECT,
      }).then(([result]: object[]) => {
        const resObj = result as
          | {
              data?: {
                id: string;
                title: string;
                chartType: string;
                defaultFilter: string;
                filters: string[];
                labelKey: string;
                data: object;
              }[];
            }
          | undefined;
        if (!resObj || !resObj.data) return [];
        return resObj.data.map(({ id, title, chartType, defaultFilter, filters, labelKey, data }) =>
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
      });

      logger.info("Metrics refreshed...");
    } catch (error) {
      const err = error as Error;
      logger.err("Error in loadMetrics:");
      logger.err(err);
    }
  }

  public getMetrics(request: RequestModel<void>): Promise<ResponseModel<Metric[]>> {
    const response = new ResponseModel<Metric[]>(request.transactionId);

    try {
      response.data = [...this.metrics];
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getMetrics:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return Promise.resolve(response);
  }

  public async queryMetric(request: RequestModel<MetricsFilter>): Promise<ResponseModel<Metric>> {
    const response = new ResponseModel<Metric>(request.transactionId);

    try {
      const data = request.data;
      if (!data) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Metrics filter is required.");
      }
      const replacements = this.initializeReplacements(data);

      const selectedFunction = METRICS_FUNCTIONS.get(String(replacements.id));

      if (!selectedFunction) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Invalid metric id");
      }

      const result = await VARIAMOS_ORM.query(`SELECT ${selectedFunction} AS data`, {
        type: QueryTypes.SELECT,
        replacements,
      }).then(([result]: object[]) => {
        const resObj = result as
          | {
              data: {
                id: string;
                title: string;
                chartType: string;
                defaultFilter: string;
                filters: string[];
                labelKey: string;
                data: object;
              };
            }
          | undefined;
        if (!resObj || !resObj.data) throw new Error("Invalid database response format");
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
      const err = error as Error;
      logger.err("Error in queryMetric:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }
}

export const MetricsRepositoryInstance = new MetricsRepositoryImpl();
