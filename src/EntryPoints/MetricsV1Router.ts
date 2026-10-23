import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import type { MetricsQueryUseCase } from "#src/Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";

export const METRICS_V1_ROUTE = "/v1/metrics";

export function createMetricsRouter(
  metricsQueryUseCase: MetricsQueryUseCase,
): Router {
  const metricsV1Router = Router();

  metricsV1Router.get(
    "/",
    hasPermissions(["metrics::query"]),
    async (_, res) => {
      const transactionId = "getMetrics";

      try {
        const request = new RequestModel<void>(transactionId);
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
            .setStartDate(startDate as string)
            .setEndDate(endDate as string)
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
