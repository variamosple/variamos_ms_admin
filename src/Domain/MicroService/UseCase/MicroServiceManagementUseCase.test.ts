import { mock, MockProxy } from "jest-mock-extended";
import { MicroServiceManagementUseCase } from "./MicroServiceManagementUseCase";
import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "@src/Domain/MicroService/Entity/MicroService";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

describe("MicroServiceManagementUseCase - Unit Tests", () => {
  let useCase: MicroServiceManagementUseCase;
  let mockMicroServiceRepository: MockProxy<IMicroServiceRepository>;

  beforeEach(() => {
    mockMicroServiceRepository = mock<IMicroServiceRepository>();
    useCase = new MicroServiceManagementUseCase(mockMicroServiceRepository);
  });

  const createMockService = (id: string, state: string) => {
    return MicroService.builder()
      .setId(id)
      .setNames(["service-name"])
      .setCreated(new Date())
      .setLabels({ key: "val" })
      .setState(state)
      .setStatus("Status: " + state)
      .build();
  };

  describe("startMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
      expect(mockMicroServiceRepository.startMicroService).not.toHaveBeenCalled();
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(res.message).toBe("Service not found");
      expect(mockMicroServiceRepository.startMicroService).not.toHaveBeenCalled();
    });

    test("should return error if microservice state is not exited", async () => {
      const mockService = createMockService("ms-1", "running");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in exited state.");
      expect(mockMicroServiceRepository.startMicroService).not.toHaveBeenCalled();
    });

    test("should start microservice if state is exited", async () => {
      const mockService = createMockService("ms-1", "exited");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const mockSuccessResponse = new ResponseModel<void>("tx-1");
      mockMicroServiceRepository.startMicroService.mockResolvedValue(mockSuccessResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.startMicroService).toHaveBeenCalledWith(req);
    });
  });

  describe("stopMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    });

    test("should return error if microservice state is not running", async () => {
      const mockService = createMockService("ms-1", "exited");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in running state.");
    });

    test("should stop microservice if state is running", async () => {
      const mockService = createMockService("ms-1", "running");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const mockSuccessResponse = new ResponseModel<void>("tx-1");
      mockMicroServiceRepository.stopMicroService.mockResolvedValue(mockSuccessResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.stopMicroService).toHaveBeenCalledWith(req);
    });
  });

  describe("restartMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    });

    test("should return error if microservice state is not running", async () => {
      const mockService = createMockService("ms-1", "exited");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService is not in running state.");
    });

    test("should restart microservice if state is running", async () => {
      const mockService = createMockService("ms-1", "running");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const mockSuccessResponse = new ResponseModel<void>("tx-1");
      mockMicroServiceRepository.restartMicroService.mockResolvedValue(mockSuccessResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.restartMicroService).toHaveBeenCalledWith(req);
    });

    test("should fallback to default error message if queryById returns error without message", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1");
      mockQueryResponse.errorCode = DomainErrorCodes.SYSTEM_ERROR;
      mockQueryResponse.message = undefined;
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("An unexpected error occurred");
    });
  });

  describe("start/stop fallback error messages", () => {
    test("should fallback to default error message in startMicroService if queryById has no message", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1");
      mockQueryResponse.errorCode = DomainErrorCodes.SYSTEM_ERROR;
      mockQueryResponse.message = undefined;
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("An unexpected error occurred");
    });

    test("should fallback to default error message in stopMicroService if queryById has no message", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1");
      mockQueryResponse.errorCode = DomainErrorCodes.SYSTEM_ERROR;
      mockQueryResponse.message = undefined;
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("An unexpected error occurred");
    });
  });
});
