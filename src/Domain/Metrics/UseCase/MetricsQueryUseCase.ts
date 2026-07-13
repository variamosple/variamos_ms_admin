import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Metric } from "@src/Domain/Metrics/Entity/Metric";
import { MetricsFilter } from "@src/Domain/Metrics/Entity/MetricsFilter";
import { IMetricsRepository } from "@src/Domain/Metrics/Repository/IMetricsRepository";

export class MetricsQueryUseCase {
  public constructor(private readonly metricsRepository: IMetricsRepository) {}

  public getMetrics(request: RequestModel<void>): Promise<ResponseModel<Metric[]>> {
    return this.metricsRepository.getMetrics(request);
  }

  public queryMetric(request: RequestModel<MetricsFilter>): Promise<ResponseModel<Metric>> {
    const defaultResponse = new ResponseModel<Metric>(request.transactionId);
    const data = request.data;

    if (!data?.getId()) {
      return defaultResponse.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "id is required.");
    } else if (!data.getStartDate() || !data.getEndDate()) {
      return defaultResponse.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "startDate and endDate are required.",
      );
    }

    const startDate = new Date(data.getStartDate());
    const endDate = new Date(data.getEndDate());

    if (startDate > endDate) {
      return defaultResponse.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "startDate must be less than endDate.",
      );
    }

    const diff = endDate.getTime() - startDate.getTime();
    const twoYearsInMs = 1000 * 60 * 60 * 24 * 365 * 2;

    if (diff > twoYearsInMs) {
      return defaultResponse.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "The difference between startDate and endDate must not be greater than 2 years.",
      );
    }

    return this.metricsRepository.queryMetric(request);
  }
}
