import { MetricsUseCases } from "./MetricsUseCases";
import { IMetricsRepository } from "./Repository/IMetricsRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Metric } from "./Entity/Metric";
import { MetricsFilter } from "./Entity/MetricsFilter";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";

describe("MetricsUseCases - Unit Tests", () => {
  let useCases: MetricsUseCases;
  let mockMetricsRepository: jest.Mocked<IMetricsRepository>;

  beforeEach(() => {
    mockMetricsRepository = {
      getMetrics: jest.fn(),
      queryMetric: jest.fn(),
    } as jest.Mocked<IMetricsRepository>;

    useCases = new MetricsUseCases(mockMetricsRepository);
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
      const mockResponse = new ResponseModel<Metric[]>("tx-1").withResponse(mockMetrics);
      mockMetricsRepository.getMetrics.mockResolvedValue(mockResponse);

      const req = new RequestModel<void>("tx-1");
      const res = await useCases.getMetrics(req);

      expect(res.data).toBe(mockMetrics);
      expect(mockMetricsRepository.getMetrics).toHaveBeenCalledWith(req);
    });
  });

  describe("queryMetric", () => {
    test("should return error if filter id is missing", async () => {
      const filter = MetricsFilter.builder()
        .setStartDate("2026-01-01")
        .setEndDate("2026-06-30")
        .build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCases.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("id is required.");
      expect(mockMetricsRepository.queryMetric).not.toHaveBeenCalled();
    });

    test("should return error if startDate is missing", async () => {
      const filter = MetricsFilter.builder().setId("metric-1").setEndDate("2026-06-30").build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCases.queryMetric(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("startDate and endDate are required.");
    });

    test("should return error if endDate is missing", async () => {
      const filter = MetricsFilter.builder().setId("metric-1").setStartDate("2026-01-01").build();
      const req = new RequestModel<MetricsFilter>("tx-2", filter);

      const res = await useCases.queryMetric(req);

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

      const res = await useCases.queryMetric(req);

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

      const res = await useCases.queryMetric(req);

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
      const mockResponse = new ResponseModel<Metric>("tx-2").withResponse(mockMetric);
      mockMetricsRepository.queryMetric.mockResolvedValue(mockResponse);

      const res = await useCases.queryMetric(req);

      expect(res.data).toBe(mockMetric);
      expect(mockMetricsRepository.queryMetric).toHaveBeenCalledWith(req);
    });
  });
});
