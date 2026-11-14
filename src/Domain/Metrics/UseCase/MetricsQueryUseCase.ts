import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { Metric } from "#src/Domain/Metrics/Entity/Metric.js";
import type { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import type { MetricsPeriod } from "#src/Domain/Metrics/Entity/MetricsPeriod.js";
import type { IMetricsRepository } from "#src/Domain/Metrics/Repository/IMetricsRepository.js";

const TWO_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 2;

// Why a period is refused, or null when the charts can be read over it
const periodError = (start: string, end: string): string | null => {
  if (!start || !end) return "startDate and endDate are required.";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "startDate and endDate must be dates.";
  }
  if (startDate > endDate) return "startDate must be less than endDate.";
  if (endDate.getTime() - startDate.getTime() > TWO_YEARS_MS) {
    return "The difference between startDate and endDate must not be greater than 2 years.";
  }
  return null;
};

export class MetricsQueryUseCase {
  public constructor(private readonly metricsRepository: IMetricsRepository) {}

  public getMetrics(
    request: RequestModel<MetricsPeriod | undefined>,
  ): Promise<ResponseModel<Metric[]>> {
    const period = request.data;
    const error = period && periodError(period.startDate, period.endDate);
    if (error) {
      return new ResponseModel<Metric[]>(
        request.transactionId,
      ).withErrorPromise(DomainErrorCodes.INVALID_INPUT, error);
    }
    return this.metricsRepository.getMetrics(request);
  }

  public queryMetric(
    request: RequestModel<MetricsFilter>,
  ): Promise<ResponseModel<Metric>> {
    const defaultResponse = new ResponseModel<Metric>(request.transactionId);
    const data = request.data;

    if (!data?.getId()) {
      return defaultResponse.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "id is required.",
      );
    }
    const error = periodError(data.getStartDate(), data.getEndDate());
    if (error) {
      return defaultResponse.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        error,
      );
    }

    return this.metricsRepository.queryMetric(request);
  }
}
