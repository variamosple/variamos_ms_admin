import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { MicroService } from "./Entity/MicroService";
import { MicroServiceFilter } from "./Entity/MicroServiceFilter";
import { IMicroServiceRepository } from "./Repository/IMicroServiceRepository";

export class MicroServiceUseCases {
  public constructor(private readonly microServiceRepository: IMicroServiceRepository) {}

  public queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>> {
    return this.microServiceRepository.queryMicroServices(request);
  }

  public async startMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    const microserviceResponse = await this.microServiceRepository.queryById(request);

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message ?? "An unexpected error occurred",
      );
    }

    if (microserviceResponse.data?.getState() !== "exited") {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService is not in exited state.",
      );
    }

    return this.microServiceRepository.startMicroService(request);
  }

  public async stopMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    const microserviceResponse = await this.microServiceRepository.queryById(request);

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message ?? "An unexpected error occurred",
      );
    }

    if (microserviceResponse.data?.getState() !== "running") {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService is not in running state.",
      );
    }

    return this.microServiceRepository.stopMicroService(request);
  }

  public async restartMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    const microserviceResponse = await this.microServiceRepository.queryById(request);

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message ?? "An unexpected error occurred",
      );
    }

    if (microserviceResponse.data?.getState() !== "running") {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService is not in running state.",
      );
    }

    return this.microServiceRepository.restartMicroService(request);
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const defaultResponse = new ResponseModel<NodeJS.ReadableStream>(request.transactionId);

    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    return this.microServiceRepository.watchMicroServiceLogs(request);
  }
}
