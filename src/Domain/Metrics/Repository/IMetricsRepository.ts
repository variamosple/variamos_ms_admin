import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Metric } from "../Entity/Metric.js";
import type { MetricsFilter } from "../Entity/MetricsFilter.js";

export interface IMetricsRepository {
  getMetrics(request: RequestModel<void>): Promise<ResponseModel<Metric[]>>;
  queryMetric(
    request: RequestModel<MetricsFilter>,
  ): Promise<ResponseModel<Metric>>;
}
