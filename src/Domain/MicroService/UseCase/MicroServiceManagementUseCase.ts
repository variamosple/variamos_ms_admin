import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";

export class MicroServiceManagementUseCase {
  public constructor(private readonly microServiceRepository: IMicroServiceRepository) {}

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
}
