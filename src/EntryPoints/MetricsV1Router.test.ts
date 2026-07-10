import express from "express";
import supertest from "supertest";
import { createMetricsRouter } from "./MetricsV1Router";
import { MetricsUseCases } from "@src/Domain/Metrics/MetricsUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Metric } from "@src/Domain/Metrics/Entity/Metric";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/Metrics/MetricsUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

interface SerializedMetric {
  id: string;
  title: string;
  chartType: string;
  defaultFilter: string;
}

interface MetricsApiResponse {
  data: SerializedMetric[];
}

interface SingleMetricApiResponse {
  data: SerializedMetric;
}

import { IMetricsRepository } from "@src/Domain/Metrics/Repository/IMetricsRepository";

describe("MetricsV1Router Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockMetricsUseCases = new MetricsUseCases(mock<IMetricsRepository>());
    app.use("/v1/metrics", createMetricsRouter(mockMetricsUseCases));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/metrics", () => {
    it("should return 200 and list of metrics on success", async () => {
      const mockMetrics = [
        Metric.builder()
          .setId("metric-1")
          .setTitle("Metric One")
          .setChartType("bar")
          .setDefaultFilter("")
          .build(),
      ];
      const expectedResponse = new ResponseModel("getMetrics").withResponse(mockMetrics);

      (MetricsUseCases.prototype.getMetrics as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/metrics");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MetricsApiResponse;
      expect(body.data[0].id).toBe("metric-1");
      expect(MetricsUseCases.prototype.getMetrics).toHaveBeenCalledTimes(1);
    });

    it("should return 500 when MetricsUseCases throws an exception", async () => {
      (MetricsUseCases.prototype.getMetrics as jest.Mock).mockRejectedValue(
        new Error("Query error"),
      );

      const response = await supertest(app).get("/v1/metrics");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/metrics/:metricId", () => {
    it("should return 200 and details of a single metric", async () => {
      const mockMetric = Metric.builder()
        .setId("metric-1")
        .setTitle("Metric One")
        .setChartType("bar")
        .setDefaultFilter("")
        .build();
      const expectedResponse = new ResponseModel("queryMetric").withResponse(mockMetric);

      (MetricsUseCases.prototype.queryMetric as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/metrics/metric-1")
        .query({ startDate: "2026-01-01", endDate: "2026-12-31" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as SingleMetricApiResponse;
      expect(body.data.id).toBe("metric-1");
      expect(MetricsUseCases.prototype.queryMetric).toHaveBeenCalledTimes(1);
    });

    it("should return 500 when queryMetric throws an exception", async () => {
      (MetricsUseCases.prototype.queryMetric as jest.Mock).mockRejectedValue(
        new Error("Query error"),
      );

      const response = await supertest(app).get("/v1/metrics/metric-1");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
