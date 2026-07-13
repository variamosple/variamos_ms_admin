import { mock, MockProxy } from "jest-mock-extended";
import { MicroServiceQueryUseCase } from "./MicroServiceQueryUseCase";
import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "@src/Domain/MicroService/Entity/MicroService";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { Readable } from "stream";

describe("MicroServiceQueryUseCase - Unit Tests", () => {
  let useCase: MicroServiceQueryUseCase;
  let mockMicroServiceRepository: MockProxy<IMicroServiceRepository>;

  beforeEach(() => {
    mockMicroServiceRepository = mock<IMicroServiceRepository>();
    useCase = new MicroServiceQueryUseCase(mockMicroServiceRepository);
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
    const res = await useCase.queryMicroServices(req);

    expect(res.data).toBe(mockServices);
    expect(mockMicroServiceRepository.queryMicroServices).toHaveBeenCalledWith(req);
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
      const mockResponse = new ResponseModel<NodeJS.ReadableStream>("tx-1").withResponse(
        mockStream,
      );
      mockMicroServiceRepository.watchMicroServiceLogs.mockResolvedValue(mockResponse);

      const req = new RequestModel<string>("tx-1", "ms-1");
      const res = await useCase.watchMicroServiceLogs(req);

      expect(res.data).toBe(mockStream);
      expect(mockMicroServiceRepository.watchMicroServiceLogs).toHaveBeenCalledWith(req);
    });
  });
});
