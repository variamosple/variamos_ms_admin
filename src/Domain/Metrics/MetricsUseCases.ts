import { MetricsRepositoryInstance } from "@src/DataProviders/Metrics/MetricsRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Metric } from "./Entity/Metric";

export class MetricsUseCases {
  getMetrics(request: RequestModel<unknown>): Promise<ResponseModel<Metric[]>> {
    return MetricsRepositoryInstance.getMetrics(request);
  }
}
