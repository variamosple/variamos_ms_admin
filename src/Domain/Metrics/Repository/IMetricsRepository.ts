import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Metric } from "../Entity/Metric.js";
import type { MetricsFilter } from "../Entity/MetricsFilter.js";
import type { MetricsPeriod } from "../Entity/MetricsPeriod.js";

export interface IMetricsRepository {
  /** Every chart, for the period given, or the last 30 days without one. */
  getMetrics(
    request: RequestModel<MetricsPeriod | undefined>,
  ): Promise<ResponseModel<Metric[]>>;
  queryMetric(
    request: RequestModel<MetricsFilter>,
  ): Promise<ResponseModel<Metric>>;
}
