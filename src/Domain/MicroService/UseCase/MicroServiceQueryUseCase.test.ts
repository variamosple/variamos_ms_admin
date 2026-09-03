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
