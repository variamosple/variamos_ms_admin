import { Readable } from "node:stream";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceDetailed } from "@src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { MicroServiceQueryUseCase } from "./MicroServiceQueryUseCase.js";

describe("MicroServiceQueryUseCase - Unit Tests", () => {
  let useCase: MicroServiceQueryUseCase;
  let mockMicroServiceRepository: MockProxy<IMicroServiceRepository>;

  beforeEach(() => {
    mockMicroServiceRepository = mock<IMicroServiceRepository>();
    useCase = new MicroServiceQueryUseCase(mockMicroServiceRepository);
  });

  const createMockDetailed = (name: string) => {
    return new MicroServiceDetailed(
      name,
      "Test Service",
      {
        status: "UP",
        serviceName: name,
        responseTimeMs: 25,
        checkedAt: new Date(),
      },
      1,
      [],
    );
  };

  test("should query microservices", async () => {
    const filter = new MicroServiceFilter();
    const mockServices = [createMockDetailed("ms-1")];
    const mockResponse = new ResponseModel<MicroServiceDetailed[]>(
      "tx-1",
    ).withResponse(mockServices);
    mockMicroServiceRepository.queryMicroServices.mockResolvedValue(
      mockResponse,
    );

    const req = new RequestModel<MicroServiceFilter>("tx-1", filter);
    const res = await useCase.queryMicroServices(req);

    expect(res.data).toBe(mockServices);
    expect(mockMicroServiceRepository.queryMicroServices).toHaveBeenCalledWith(
      req,
    );
  });

  describe("queryByName", () => {
    test("should reject when name is missing or blank", async () => {
      const req = new RequestModel<string>("tx-name", "   ");
      const res = await useCase.queryByName(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Microservice name is required.");
    });

    test("should return service details on success", async () => {
      const mockService = createMockDetailed("ms-auth");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-name").withResponse(
          mockService,
        ),
      );

      const req = new RequestModel<string>("tx-name", "ms-auth");
      const res = await useCase.queryByName(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBe(mockService);
    });
  });

  describe("getHealthHistory", () => {
    test("should reject when serviceName is missing", async () => {
      const req = new RequestModel<{ serviceName: string }>("tx-hh", {
        serviceName: "",
      });
      const res = await useCase.getHealthHistory(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Service name is required.");
    });

    test("should return health history summary on success", async () => {
      const mockSummary = {
        serviceName: "ms-auth",
        currentStatus: "UP" as const,
        uptime24hPercentage: 100,
        uptime30dPercentage: 99.8,
        averageResponseTimeMs: 12,
        history: [],
      };
      mockMicroServiceRepository.getHealthHistory.mockResolvedValue(
        new ResponseModel("tx-hh").withResponse(mockSummary),
      );

      const req = new RequestModel("tx-hh", {
        serviceName: "ms-auth",
        days: 30,
      });
      const res = await useCase.getHealthHistory(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toEqual(mockSummary);
    });
  });

  describe("queryConfigurations", () => {
    test("should reject when serviceName is blank", async () => {
      const req = new RequestModel<string>("tx-cfg", "");
      const res = await useCase.queryConfigurations(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Service name is required.");
    });

    test("should return configuration list on success", async () => {
      const mockConfigs = [
        {
          serviceName: "ms-auth",
          key: "PORT",
          value: "3001",
          type: "number" as const,
        },
      ];
      mockMicroServiceRepository.queryConfigurations.mockResolvedValue(
        new ResponseModel("tx-cfg").withResponse(mockConfigs),
      );

      const req = new RequestModel<string>("tx-cfg", "ms-auth");
      const res = await useCase.queryConfigurations(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toEqual(mockConfigs);
    });
  });

  describe("queryAuditLogs", () => {
    test("should reject when serviceName is missing", async () => {
      const req = new RequestModel<{ serviceName: string }>("tx-al", {
        serviceName: "",
      });
      const res = await useCase.queryAuditLogs(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Service name is required.");
    });

    test("should return audit logs on success", async () => {
      const mockLogs = [
        {
          serviceName: "ms-auth",
          action: "RESTART",
          performedBy: "admin",
          timestamp: new Date(),
        },
      ];
      mockMicroServiceRepository.queryAuditLogs.mockResolvedValue(
        new ResponseModel("tx-al").withResponse(mockLogs),
      );

      const req = new RequestModel("tx-al", {
        serviceName: "ms-auth",
        limit: 10,
      });
      const res = await useCase.queryAuditLogs(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toEqual(mockLogs);
    });
  });

  describe("watchMicroServiceLogs", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.watchMicroServiceLogs(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should watch microservice logs successfully", async () => {
      const mockStream = new Readable();
      const mockResponse = new ResponseModel<NodeJS.ReadableStream>(
        "tx-1",
      ).withResponse(mockStream);
      mockMicroServiceRepository.watchMicroServiceLogs.mockResolvedValue(
        mockResponse,
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.watchMicroServiceLogs(req);

      expect(res.data).toBe(mockStream);
      expect(
        mockMicroServiceRepository.watchMicroServiceLogs,
      ).toHaveBeenCalledWith(req);
    });
  });
});
