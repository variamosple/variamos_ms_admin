import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MetricsFilter } from "@src/Domain/Metrics/Entity/MetricsFilter";
import { MetricsQueryUseCase } from "@src/Domain/Metrics/UseCase/MetricsQueryUseCase";
import { hasPermissions } from "@variamosple/variamos-security";

import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

export const METRICS_V1_ROUTE = "/v1/metrics";

export function createMetricsRouter(metricsQueryUseCase: MetricsQueryUseCase): Router {
  const metricsV1Router = Router();

  metricsV1Router.get("/", hasPermissions(["metrics::query"]), async (_, res) => {
    const transactionId = "getMetrics";

    try {
      const request = new RequestModel<void>(transactionId);
      const response = await metricsQueryUseCase.getMetrics(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  metricsV1Router.get("/:metricId", hasPermissions(["metrics::query"]), async (req, res) => {
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
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  return metricsV1Router;
}
