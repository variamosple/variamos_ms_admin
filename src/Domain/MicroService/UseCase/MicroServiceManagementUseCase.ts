import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import type { IMicroServiceRepository } from "../Repository/IMicroServiceRepository.js";

export class MicroServiceManagementUseCase {
  public constructor(
    private readonly microServiceRepository: IMicroServiceRepository,
  ) {}

  public async startMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    if (this.microServiceRepository.queryByName) {
      const queryResponse =
        await this.microServiceRepository.queryByName(request);
      if (queryResponse?.errorCode) {
        return defaultResponse.withError(
          queryResponse.errorCode,
          queryResponse.message ?? "An unexpected error occurred",
        );
      }
      if (queryResponse?.data && queryResponse.data.health.status === "UP") {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in exited state.",
        );
      }
    }

    return this.microServiceRepository.startMicroService(request);
  }

  public async stopMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    if (this.microServiceRepository.queryByName) {
      const queryResponse =
        await this.microServiceRepository.queryByName(request);
      if (queryResponse?.errorCode) {
        return defaultResponse.withError(
          queryResponse.errorCode,
          queryResponse.message ?? "An unexpected error occurred",
        );
      }
      if (queryResponse?.data && queryResponse.data.health.status !== "UP") {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in running state.",
        );
      }
    }

    return this.microServiceRepository.stopMicroService(request);
  }

  public async restartMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    if (this.microServiceRepository.queryByName) {
      const queryResponse =
        await this.microServiceRepository.queryByName(request);
      if (queryResponse?.errorCode) {
        return defaultResponse.withError(
          queryResponse.errorCode,
          queryResponse.message ?? "An unexpected error occurred",
        );
      }
      if (queryResponse?.data && queryResponse.data.health.status !== "UP") {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in running state.",
        );
      }
    }

    return this.microServiceRepository.restartMicroService(request);
  }

  public async scaleMicroService(
    request: RequestModel<{ serviceName: string; replicas: number }>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data?.serviceName || request.data.replicas === undefined) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name and valid replicas count are required.",
      );
    }
    if (request.data.replicas < 0 || request.data.replicas > 10) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Replicas count must be between 0 and 10.",
      );
    }
    return this.microServiceRepository.scaleMicroService(request);
  }

  public async updateConfiguration(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string;
      operatorId: string;
    }>,
  ): Promise<ResponseModel<MicroServiceConfigItem>> {
    const defaultResponse = new ResponseModel<MicroServiceConfigItem>(
      request.transactionId,
    );
    if (
      !request.data?.serviceName ||
      !request.data?.key ||
      request.data?.value === undefined
    ) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name, key and value are required.",
      );
    }
    return this.microServiceRepository.updateConfiguration(request);
  }
}
