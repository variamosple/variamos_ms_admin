import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { MetricsRepositoryInstance } from "@src/DataProviders/Metrics/MetricsRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Metric } from "./Entity/Metric";
import { MetricsFilter } from "./Entity/MetricsFilter";

export class MetricsUseCases {
  getMetrics(request: RequestModel<unknown>): Promise<ResponseModel<Metric[]>> {
    return MetricsRepositoryInstance.getMetrics(request);
  }

  queryMetric(
    request: RequestModel<MetricsFilter>
  ): Promise<ResponseModel<Metric>> {
    const defaultResponse = new ResponseModel<Metric>(request.transactionId);
    const data = request.data;

    if (!data?.getId()) {
      return defaultResponse.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "id is required."
      );
    } else if (!data.getStartDate() || !data.getEndDate()) {
      return defaultResponse.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "startDate and endDate are required."
      );
    }

    const startDate = new Date(data.getStartDate());
    const endDate = new Date(data.getEndDate());

    if (startDate > endDate) {
      return defaultResponse.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "startDate must be less than endDate."
      );
    }

    const diff = endDate.getTime() - startDate.getTime();
    const twoYearsInMs = 1000 * 60 * 60 * 24 * 365 * 2;

    if (diff > twoYearsInMs) {
      return defaultResponse.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "The difference between startDate and endDate must not be greater than 2 years."
      );
    }

    return MetricsRepositoryInstance.queryMetric(request);
  }
}
