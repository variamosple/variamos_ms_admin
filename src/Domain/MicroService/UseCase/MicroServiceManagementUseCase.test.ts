import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceDetailed } from "@src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { MicroServiceManagementUseCase } from "./MicroServiceManagementUseCase.js";

describe("MicroServiceManagementUseCase - Unit Tests", () => {
  let useCase: MicroServiceManagementUseCase;
  let mockMicroServiceRepository: MockProxy<IMicroServiceRepository>;

  beforeEach(() => {
    mockMicroServiceRepository = mock<IMicroServiceRepository>();
    useCase = new MicroServiceManagementUseCase(mockMicroServiceRepository);
  });

  const createMockDetailed = (
    name: string,
    status: "UP" | "DOWN" | "DEGRADED",
  ) => {
    return new MicroServiceDetailed(
      name,
      "Test Service",
      {
        status,
        serviceName: name,
        responseTimeMs: 25,
        checkedAt: new Date(),
      },
      1,
      [],
    );
  };

  describe("startMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
      expect(
        mockMicroServiceRepository.startMicroService,
      ).not.toHaveBeenCalled();
    });

    test("should return error if queryByName returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroServiceDetailed>(
        "tx-1",
      ).withError(DomainErrorCodes.ENTITY_NOT_FOUND, "Service not found");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        mockQueryResponse,
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(res.message).toBe("Service not found");
    });

    test("should start microservice when state is DOWN/exited", async () => {
      const mockService = createMockDetailed("ms-1", "DOWN");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-1").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.startMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.startMicroService).toHaveBeenCalledWith(
        req,
      );
    });

    test("should reject start if service is already UP", async () => {
      const mockService = createMockDetailed("ms-1", "UP");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-1").withResponse(
          mockService,
        ),
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in exited state.");
    });
  });

  describe("stopMicroService", () => {
    test("should reject when microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-stop", undefined);
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should forward error when queryByName fails", async () => {
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-stop").withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "Not found",
        ),
      );

      const req = new RequestModel<string>("tx-stop", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    });

    test("should reject stop if service is not running", async () => {
      const mockService = createMockDetailed("ms-1", "DOWN");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-stop").withResponse(
          mockService,
        ),
      );

      const req = new RequestModel<string>("tx-stop", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in running state.");
    });

    test("should stop service when currently running", async () => {
      const mockService = createMockDetailed("ms-1", "UP");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-stop").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.stopMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-stop"),
      );

      const req = new RequestModel<string>("tx-stop", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.stopMicroService).toHaveBeenCalledWith(
        req,
      );
    });
  });

  describe("restartMicroService", () => {
    test("should reject when microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-restart", undefined);
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should restart service when currently running", async () => {
      const mockService = createMockDetailed("ms-1", "UP");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-restart").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.restartMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-restart"),
      );

      const req = new RequestModel<string>("tx-restart", "ms-1");
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        mockMicroServiceRepository.restartMicroService,
      ).toHaveBeenCalledWith(req);
    });
  });

  describe("scaleMicroService", () => {
    test("should reject when serviceName is missing or replicas undefined", async () => {
      const req = new RequestModel<{ serviceName: string; replicas: number }>(
        "tx-scale",
        // biome-ignore lint/suspicious/noExplicitAny: test defensive edge case
        { serviceName: "", replicas: undefined as any },
      );

      const res = await useCase.scaleMicroService(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    test("should validate replicas count bounds", async () => {
      const req = new RequestModel<{ serviceName: string; replicas: number }>(
        "tx-scale",
        {
          serviceName: "ms_lang",
          replicas: 15,
        },
      );

      const res = await useCase.scaleMicroService(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Replicas count must be between 0 and 10.");
    });

    test("should scale microservice when valid", async () => {
      mockMicroServiceRepository.scaleMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-scale"),
      );

      const req = new RequestModel<{ serviceName: string; replicas: number }>(
        "tx-scale",
        {
          serviceName: "ms_lang",
          replicas: 3,
        },
      );

      const res = await useCase.scaleMicroService(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.scaleMicroService).toHaveBeenCalledWith(
        req,
      );
    });
  });

  describe("updateConfiguration", () => {
    test("should validate required configuration fields", async () => {
      const req = new RequestModel<{
        serviceName: string;
        key: string;
        value: string;
        operatorId: string;
      }>("tx-cfg", {
        serviceName: "",
        key: "",
        value: "val",
        operatorId: "op-1",
      });

      const res = await useCase.updateConfiguration(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Service name, key and value are required.");
    });

    test("should delegate configuration update to repository", async () => {
      const configItem = {
        serviceName: "ms-1",
        key: "LOG_LEVEL",
        value: "debug",
        type: "string" as const,
      };
      mockMicroServiceRepository.updateConfiguration.mockResolvedValue(
        new ResponseModel("tx-cfg").withResponse(configItem),
      );

      const req = new RequestModel("tx-cfg", {
        serviceName: "ms-1",
        key: "LOG_LEVEL",
        value: "debug",
        operatorId: "op-1",
      });

      const res = await useCase.updateConfiguration(req);
      expect(res.errorCode).toBeUndefined();
      expect(res.data).toEqual(configItem);
    });
  });

  describe("triggerHealthChecks", () => {
    test("should successfully trigger health checks without service name", async () => {
      const req = new RequestModel<{ serviceName?: string }>("tx-hc", {});
      const res = await useCase.triggerHealthChecks(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        mockMicroServiceRepository.triggerHealthChecks,
      ).toHaveBeenCalledWith(undefined);
    });

    test("should handle repository exceptions and return SYSTEM_ERROR", async () => {
      mockMicroServiceRepository.triggerHealthChecks.mockRejectedValue(
        new Error("Ping failure"),
      );

      const req = new RequestModel<{ serviceName?: string }>("tx-hc", {
        serviceName: "ms-1",
      });
      const res = await useCase.triggerHealthChecks(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toContain("Failed to trigger health checks");
    });
  });
});
