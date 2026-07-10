import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Metric } from "../Entity/Metric";
import { MetricsFilter } from "../Entity/MetricsFilter";

export interface IMetricsRepository {
  getMetrics(request: RequestModel<void>): Promise<ResponseModel<Metric[]>>;
  queryMetric(request: RequestModel<MetricsFilter>): Promise<ResponseModel<Metric>>;
}
