import { describe, expect, test, vi } from "vitest";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { MicroServiceDetailed } from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { IMicroServiceRepository } from "#src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import type { ServiceStatus } from "../Entity/MicroServiceHealth.js";
import {
  MicroServiceManagementUseCase,
  SCALING_NOT_AVAILABLE,
} from "./MicroServiceManagementUseCase.js";

const ACTOR = "operator@example.com";

describe("MicroServiceManagementUseCase - Unit Tests", () => {
  let useCase: MicroServiceManagementUseCase;
  let logger: MockProxy<ILogger>;
  let mockMicroServiceRepository: MockProxy<IMicroServiceRepository>;

  beforeEach(() => {
    logger = mock<ILogger>();
    mockMicroServiceRepository = mock<IMicroServiceRepository>();
    useCase = new MicroServiceManagementUseCase(
      mockMicroServiceRepository,
      logger,
    );
  });

  // Actions follow the container state; the health status is kept apart
  const createMockDetailed = (
    name: string,
    containerState: "running" | "exited",
    status: ServiceStatus = containerState === "running" ? "UP" : "DOWN",
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
      [
        {
          id: `${name}-1`,
          name,
          state: containerState,
          status: containerState,
          created: new Date(),
          labels: {},
        },
      ],
    );
  };

  describe("startMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.startMicroService(req, ACTOR);

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
      const res = await useCase.startMicroService(req, ACTOR);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(res.message).toBe("Service not found");
    });

    test("should start microservice when state is DOWN/exited", async () => {
      const mockService = createMockDetailed("ms-1", "exited");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-1").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.startMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req, ACTOR);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.startMicroService).toHaveBeenCalledWith(
        req,
        ACTOR,
      );
    });

    test("should reject start if service is already UP", async () => {
      const mockService = createMockDetailed("ms-1", "running");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-1").withResponse(
          mockService,
        ),
      );

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req, ACTOR);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in exited state.");
    });
  });

  describe("stopMicroService", () => {
    test("should reject when microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-stop", undefined);
      const res = await useCase.stopMicroService(req, ACTOR);

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
      const res = await useCase.stopMicroService(req, ACTOR);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    });

    test("should reject stop if service is not running", async () => {
      const mockService = createMockDetailed("ms-1", "exited");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-stop").withResponse(
          mockService,
        ),
      );

      const req = new RequestModel<string>("tx-stop", "ms-1");
      const res = await useCase.stopMicroService(req, ACTOR);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in running state.");
    });

    test("should stop service when currently running", async () => {
      const mockService = createMockDetailed("ms-1", "running");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-stop").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.stopMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-stop"),
      );

      const req = new RequestModel<string>("tx-stop", "ms-1");
      const res = await useCase.stopMicroService(req, ACTOR);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.stopMicroService).toHaveBeenCalledWith(
        req,
        ACTOR,
      );
    });
  });

  describe("restartMicroService", () => {
    test("should reject when microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-restart", undefined);
      const res = await useCase.restartMicroService(req, ACTOR);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should restart service when currently running", async () => {
      const mockService = createMockDetailed("ms-1", "running");
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx-restart").withResponse(
          mockService,
        ),
      );
      mockMicroServiceRepository.restartMicroService.mockResolvedValue(
        new ResponseModel<void>("tx-restart"),
      );

      const req = new RequestModel<string>("tx-restart", "ms-1");
      const res = await useCase.restartMicroService(req, ACTOR);

      expect(res.errorCode).toBeUndefined();
      expect(
        mockMicroServiceRepository.restartMicroService,
      ).toHaveBeenCalledWith(req, ACTOR);
    });
  });

  describe("actions follow the container, not the health check", () => {
    const answer = (service: MicroServiceDetailed) =>
      mockMicroServiceRepository.queryByName.mockResolvedValue(
        new ResponseModel<MicroServiceDetailed>("tx").withResponse(service),
      );

    test.each(["NO_DATA", "DOWN"] as const)(
      "restarts and stops a running service whose status is %s",
      async (status) => {
        answer(createMockDetailed("ms-1", "running", status));
        mockMicroServiceRepository.restartMicroService.mockResolvedValue(
          new ResponseModel<void>("tx"),
        );
        mockMicroServiceRepository.stopMicroService.mockResolvedValue(
          new ResponseModel<void>("tx"),
        );
        const req = new RequestModel<string>("tx", "ms-1");

        expect((await useCase.restartMicroService(req, ACTOR)).errorCode).toBe(
          undefined,
        );
        expect((await useCase.stopMicroService(req, ACTOR)).errorCode).toBe(
          undefined,
        );
        expect((await useCase.startMicroService(req, ACTOR)).message).toBe(
          "MicroService is not in exited state.",
        );
      },
    );

    test("starts a stopped service even if its last check was UP", async () => {
      answer(createMockDetailed("ms-1", "exited", "UP"));
      mockMicroServiceRepository.startMicroService.mockResolvedValue(
        new ResponseModel<void>("tx"),
      );
      const req = new RequestModel<string>("tx", "ms-1");

      expect((await useCase.startMicroService(req, ACTOR)).errorCode).toBe(
        undefined,
      );
      expect((await useCase.restartMicroService(req, ACTOR)).message).toBe(
        "MicroService is not in running state.",
      );
    });
  });

  describe("scaleMicroService", () => {
    test.each([3, 50])(
      "refuses %i replicas as not implemented, without any write",
      async (replicas) => {
        const res = await useCase.scaleMicroService(
          new RequestModel("tx-scale", { serviceName: "ms_lang", replicas }),
        );

        expect(res.errorCode).toBe(DomainErrorCodes.NOT_IMPLEMENTED);
        expect(res.message).toBe(SCALING_NOT_AVAILABLE);
        expect(SCALING_NOT_AVAILABLE).toBe(
          "Scaling is not available: the number of replicas is set in the server's compose file.",
        );
      },
    );
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
      const configItem = new MicroServiceConfigItem(
        1,
        "ms-1",
        "LOG_LEVEL",
        "debug",
        "string",
        false,
        false,
      );
      mockMicroServiceRepository.updateConfiguration.mockResolvedValue(
        new ResponseModel<MicroServiceConfigItem>("tx-cfg").withResponse(
          configItem,
        ),
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
      mockMicroServiceRepository.triggerHealthChecks = vi
        .fn()
        .mockResolvedValue(undefined);

      const req = new RequestModel<{ serviceName?: string }>("tx-hc", {});
      const res = await useCase.triggerHealthChecks(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        mockMicroServiceRepository.triggerHealthChecks,
      ).toHaveBeenCalledWith(undefined);
    });

    test("should handle repository exceptions and return SYSTEM_ERROR", async () => {
      mockMicroServiceRepository.triggerHealthChecks = vi
        .fn()
        .mockRejectedValue(new Error("Ping failure"));

      const req = new RequestModel<{ serviceName?: string }>("tx-hc", {
        serviceName: "ms-1",
      });
      const res = await useCase.triggerHealthChecks(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toContain("Failed to trigger health checks");
    });
  });
});
