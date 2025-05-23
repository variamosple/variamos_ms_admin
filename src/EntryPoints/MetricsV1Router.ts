import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Metric } from "@src/Domain/Metrics/Entity/Metric";
import { MetricsFilter } from "@src/Domain/Metrics/Entity/MetricsFilter";
import { MetricsUseCases } from "@src/Domain/Metrics/MetricsUseCases";
import { hasPermissions } from "@variamosple/variamos-security";

import { Router } from "express";
import logger from "jet-logger";

export const METRICS_V1_ROUTE = "/v1/metrics";

const metricsV1Router = Router();

metricsV1Router.get("/", hasPermissions(["metrics::query"]), async (_, res) => {
  const transactionId = "getMetrics";

  try {
    const request = new RequestModel<Metric>(transactionId);
    const response = await new MetricsUseCases().getMetrics(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

metricsV1Router.get(
  "/:metricId",
  hasPermissions(["metrics::query"]),
  async (req, res) => {
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
          .build()
      );
      const response = await new MetricsUseCases().queryMetric(request);

      const status = response.errorCode || 200;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        500,
        "Internal Server Error"
      );
      res.status(500).json(response);
    }
  }
);

export default metricsV1Router;
