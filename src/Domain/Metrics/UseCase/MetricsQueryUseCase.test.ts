import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Metric } from "#src/Domain/Metrics/Entity/Metric.js";
import { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import type { IMetricsRepository } from "#src/Domain/Metrics/Repository/IMetricsRepository.js";
import { MetricsQueryUseCase } from "./MetricsQueryUseCase.js";

describe("MetricsQueryUseCase - Unit Tests", () => {
  let useCase: MetricsQueryUseCase;
  let mockMetricsRepository: MockProxy<IMetricsRepository>;

  beforeEach(() => {
    mockMetricsRepository = mock<IMetricsRepository>();
    useCase = new MetricsQueryUseCase(mockMetricsRepository);
  });

  describe("getMetrics", () => {
    test("should retrieve metrics successfully", async () => {
      const mockMetrics = [
        Metric.builder()
          .setId("metric-1")
          .setTitle("Test Metric")
          .setChartType("bar")
          .setDefaultFilter("yearly")
          .build(),
      ];
      const mockResponse = new ResponseModel<Metric[]>("tx-1").withResponse(
        mockMetrics,
      );
      mockMetricsRepository.getMetrics.mockResolvedValue(mockResponse);

      const req = new RequestModel<undefined>("tx-1");
      const res = await useCase.getMetrics(req);

      expect(res.data).toBe(mockMetrics);
      expect(mockMetricsRepository.getMetrics).toHaveBeenCalledWith(req);
    });

    test("reads every chart over a valid period", async () => {
      mockMetricsRepository.getMetrics.mockResolvedValue(
        new ResponseModel<Metric[]>("tx-p").withResponse([]),
      );
      const req = new RequestModel("tx-p", {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      });

      await useCase.getMetrics(req);

      expect(mockMetricsRepository.getMetrics).toHaveBeenCalledWith(req);
    });

    test.each(["America/Bogota", "UTC", "Asia/Calcutta", "Etc/GMT+5"])(
      "reads the charts in the zone %s",
      async (timeZone) => {
        mockMetricsRepository.getMetrics.mockResolvedValue(
          new ResponseModel<Metric[]>("tx-z").withResponse([]),
        );
        const req = new RequestModel("tx-z", {
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          timeZone,
        });

        const res = await useCase.getMetrics(req);

        expect(res.errorCode).toBeUndefined();
        expect(mockMetricsRepository.getMetrics).toHaveBeenCalledWith(req);
      },
    );

    test.each([
      "Mars/Olympus",
      "+05:00",
      "",
      "America/Bogota'; DROP TABLE x; --",
      `Europe/${"x".repeat(70)}`,
    ])("refuses the zone %j without reading the database", async (timeZone) => {
      const res = await useCase.getMetrics(
        new RequestModel("tx-z", {
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          timeZone,
        }),
      );

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toContain("timeZone");
      expect(mockMetricsRepository.getMetrics).not.toHaveBeenCalled();
    });

    test.each([
      [{ startDate: "2026-09-01", endDate: "" }, "required"],
      [{ startDate: "2026-09-01", endDate: "soon" }, "must be dates"],
      [{ startDate: "2026-09-30", endDate: "2026-09-01" }, "less than"],
      [{ startDate: "2023-01-01", endDate: "2026-01-01" }, "2 years"],
    ])(
      "refuses the period %j without reading the database",
      async (period, message) => {
        const res = await useCase.getMetrics(new RequestModel("tx-p", period));

        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
        expect(res.message).toContain(message);
        expect(mockMetricsRepository.getMetrics).not.toHaveBeenCalled();
      },
    );
  });

  describe("queryMetric", () => {
    test("should return error if filter id is missing", async () => {
      const filter = MetricsFilter.builder()
        .setStartDate("2026-01-01")
        .setEndDate("2026-06-30")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCase.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("id is required.");
      expect(mockMetricsRepository.queryMetric).not.toHaveBeenCalled();
    });

    test("should return error if startDate is missing", async () => {
      const filter = MetricsFilter.builder()
        .setId("metric-1")
        .setEndDate("2026-06-30")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCase.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("startDate and endDate are required.");
    });

    test("should return error if endDate is missing", async () => {
      const filter = MetricsFilter.builder()
        .setId("metric-1")
        .setStartDate("2026-01-01")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCase.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("startDate and endDate are required.");
    });

    test("should return error if startDate is greater than endDate", async () => {
      const filter = MetricsFilter.builder()
        .setId("metric-1")
        .setStartDate("2026-07-01")
        .setEndDate("2026-06-30")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCase.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("startDate must be less than endDate.");
    });

    test("should return error if the gap between dates is greater than 2 years", async () => {
      const filter = MetricsFilter.builder()
        .setId("metric-1")
        .setStartDate("2020-01-01")
        .setEndDate("2023-01-01")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCase.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe(
        "The difference between startDate and endDate must not be greater than 2 years.",
      );
    });

    test("should query metric successfully with valid filters", async () => {
      const filter = MetricsFilter.builder()
        .setId("metric-1")
        .setStartDate("2026-01-01")
        .setEndDate("2026-06-30")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const mockMetric = Metric.builder()
        .setId("metric-1")
        .setTitle("Test Metric")
        .setChartType("bar")
        .setDefaultFilter("yearly")
        .build();
      const mockResponse = new ResponseModel<Metric>("tx-2").withResponse(
        mockMetric,
      );
      mockMetricsRepository.queryMetric.mockResolvedValue(mockResponse);

      const res = await useCase.queryMetric(req);

      expect(res.data).toBe(mockMetric);
      expect(mockMetricsRepository.queryMetric).toHaveBeenCalledWith(req);
    });
  });
});
