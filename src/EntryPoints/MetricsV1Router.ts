import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import type { MetricsPeriod } from "#src/Domain/Metrics/Entity/MetricsPeriod.js";
import type { MetricsQueryUseCase } from "#src/Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { queryText } from "./queryText.js";

export const METRICS_V1_ROUTE = "/v1/metrics";

export function createMetricsRouter(
  metricsQueryUseCase: MetricsQueryUseCase,
): Router {
  const metricsV1Router = Router();

  metricsV1Router.get(
    "/",
    hasPermissions(["metrics::query"]),
    async (req, res) => {
      const transactionId = "getMetrics";
      const startDate = queryText(req.query.startDate);
      const endDate = queryText(req.query.endDate);
      const timeZone = queryText(req.query.timeZone);

      try {
        // Without a period, the last 30 days in UTC; half of one is refused
        const request = new RequestModel<MetricsPeriod | undefined>(
          transactionId,
          startDate === undefined && endDate === undefined
            ? undefined
            : {
                startDate: startDate ?? "",
                endDate: endDate ?? "",
                ...(timeZone === undefined ? {} : { timeZone }),
              },
        );
        const response = await metricsQueryUseCase.getMetrics(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  metricsV1Router.get(
    "/:metricId",
    hasPermissions(["metrics::query"]),
    async (req: Request<{ metricId: string }>, res) => {
      const transactionId = "queryMetric";
      const metricId = req.params.metricId;
      const { startDate, endDate } = req.query;

      try {
        const request = new RequestModel<MetricsFilter>(
          transactionId,
          MetricsFilter.builder()
            .setId(metricId)
            .setStartDate(queryText(startDate) ?? "")
            .setEndDate(queryText(endDate) ?? "")
            .build(),
        );
        const response = await metricsQueryUseCase.queryMetric(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return metricsV1Router;
}
