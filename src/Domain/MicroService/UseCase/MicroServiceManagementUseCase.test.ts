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
  });

  describe("scaleMicroService", () => {
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
});
