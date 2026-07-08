import { MicroServiceUseCases } from "./MicroServiceCases";
import { IMicroServiceRepository } from "./Repository/IMicroServiceRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { MicroService } from "./Entity/MicroService";
import { MicroServiceFilter } from "./Entity/MicroServiceFilter";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { Readable } from "stream";

describe("MicroServiceUseCases - Unit Tests", () => {
  let useCases: MicroServiceUseCases;
  let mockMicroServiceRepository: jest.Mocked<IMicroServiceRepository>;

  beforeEach(() => {
    mockMicroServiceRepository = {
      queryMicroServices: jest.fn(),
      queryById: jest.fn(),
      startMicroService: jest.fn(),
      stopMicroService: jest.fn(),
      restartMicroService: jest.fn(),
      watchMicroServiceLogs: jest.fn(),
    } as jest.Mocked<IMicroServiceRepository>;

    useCases = new MicroServiceUseCases(mockMicroServiceRepository);
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

  test("should query microservices", async () => {
    const filter = new MicroServiceFilter();
    const mockServices = [createMockService("ms-1", "running")];
    const mockResponse = new ResponseModel<MicroService[]>("tx-1").withResponse(mockServices);
    mockMicroServiceRepository.queryMicroServices.mockResolvedValue(mockResponse);

    const req = new RequestModel<MicroServiceFilter>("tx-1", filter);
    const res = await useCases.queryMicroServices(req);

    expect(res.data).toBe(mockServices);
    expect(mockMicroServiceRepository.queryMicroServices).toHaveBeenCalledWith(req);
  });

  describe("startMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCases.startMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
      expect(mockMicroServiceRepository.startMicroService).not.toHaveBeenCalled();
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        "NOT_FOUND",
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.startMicroService(req);

      expect(res.errorCode).toBe("NOT_FOUND");
      expect(res.message).toBe("Service not found");
      expect(mockMicroServiceRepository.startMicroService).not.toHaveBeenCalled();
    });

    test("should return error if microservice state is not exited", async () => {
      const mockService = createMockService("ms-1", "running");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.startMicroService(req);

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
      const res = await useCases.startMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.startMicroService).toHaveBeenCalledWith(req);
    });
  });

  describe("stopMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCases.stopMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        "NOT_FOUND",
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.stopMicroService(req);

      expect(res.errorCode).toBe("NOT_FOUND");
    });

    test("should return error if microservice state is not running", async () => {
      const mockService = createMockService("ms-1", "exited");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.stopMicroService(req);

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
      const res = await useCases.stopMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.stopMicroService).toHaveBeenCalledWith(req);
    });
  });

  describe("restartMicroService", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCases.restartMicroService(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should return error if queryById returns error", async () => {
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withError(
        "NOT_FOUND",
        "Service not found",
      );
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.restartMicroService(req);

      expect(res.errorCode).toBe("NOT_FOUND");
    });

    test("should return error if microservice state is not running", async () => {
      const mockService = createMockService("ms-1", "exited");
      const mockQueryResponse = new ResponseModel<MicroService>("tx-1").withResponse(mockService);
      mockMicroServiceRepository.queryById.mockResolvedValue(mockQueryResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.restartMicroService(req);

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
      const res = await useCases.restartMicroService(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMicroServiceRepository.restartMicroService).toHaveBeenCalledWith(req);
    });
  });

  describe("watchMicroServiceLogs", () => {
    test("should return BAD_REQUEST if microservice id is missing", async () => {
      const req = new RequestModel<string>("tx-1", undefined);
      const res = await useCases.watchMicroServiceLogs(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("MicroService Id is required.");
    });

    test("should watch microservice logs successfully", async () => {
      const mockStream = new Readable();
      const mockResponse = new ResponseModel<NodeJS.ReadableStream>("tx-1").withResponse(
        mockStream,
      );
      mockMicroServiceRepository.watchMicroServiceLogs.mockResolvedValue(mockResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCases.watchMicroServiceLogs(req);

      expect(res.data).toBe(mockStream);
      expect(mockMicroServiceRepository.watchMicroServiceLogs).toHaveBeenCalledWith(req);
    });
  });
});
