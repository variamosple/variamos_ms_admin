import type { IConfigEventPublisher } from "#src/Domain/Configuration/Event/IConfigEventPublisher.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import { isRunning } from "../Entity/MicroServiceHealth.js";
import type { IMicroServiceRepository } from "../Repository/IMicroServiceRepository.js";

export const SCALING_NOT_AVAILABLE =
  "Scaling is not available: the number of replicas is set in the server's compose file.";

export class MicroServiceManagementUseCase {
  public constructor(
    private readonly microServiceRepository: IMicroServiceRepository,
    private readonly logger: ILogger,
    private readonly configurationRepository: Pick<
      IConfigurationRepository,
      "queryByKey"
    >,
    private readonly configEventPublisher: IConfigEventPublisher,
  ) {}

  public async startMicroService(
    request: RequestModel<string>,
    actorId: string,
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
      // Actions follow the container, not the health check: a running
      // service that answers badly can still be stopped or restarted
      if (queryResponse?.data && isRunning(queryResponse.data.containers)) {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in exited state.",
        );
      }
    }

    return this.microServiceRepository.startMicroService(request, actorId);
  }

  public async stopMicroService(
    request: RequestModel<string>,
    actorId: string,
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
      if (queryResponse?.data && !isRunning(queryResponse.data.containers)) {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in running state.",
        );
      }
    }

    return this.microServiceRepository.stopMicroService(request, actorId);
  }

  public async restartMicroService(
    request: RequestModel<string>,
    actorId: string,
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
      if (queryResponse?.data && !isRunning(queryResponse.data.containers)) {
        return defaultResponse.withError(
          DomainErrorCodes.INVALID_INPUT,
          "MicroService is not in running state.",
        );
      }
    }

    return this.microServiceRepository.restartMicroService(request, actorId);
  }

  // The replicas are set in the server's compose file: answering success
  // without acting would mislead the operator (T-25, decision D3)
  public async scaleMicroService(
    request: RequestModel<{ serviceName: string; replicas: number }>,
  ): Promise<ResponseModel<void>> {
    return new ResponseModel<void>(request.transactionId).withError(
      DomainErrorCodes.NOT_IMPLEMENTED,
      SCALING_NOT_AVAILABLE,
    );
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
    const { key } = request.data;
    const response =
      await this.microServiceRepository.updateConfiguration(request);
    if (!response.errorCode) {
      await this.publishConfigUpdated(request.transactionId, key);
    }
    return response;
  }

  // As after an update from the configuration page, so that what follows a
  // key (the health check interval) sees the new value (EV-70)
  private async publishConfigUpdated(
    transactionId: string | undefined,
    key: string,
  ): Promise<void> {
    const updated = await this.configurationRepository.queryByKey(
      new RequestModel(transactionId, key),
    );
    if (updated.data) {
      await this.configEventPublisher.publishConfigUpdated(updated.data);
    } else {
      this.logger.warn(
        `Event config.updated not published: configuration '${key}' could not be read back.`,
      );
    }
  }

  public async triggerHealthChecks(
    request: RequestModel<{ serviceName?: string }>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    try {
      if (this.microServiceRepository.triggerHealthChecks) {
        await this.microServiceRepository.triggerHealthChecks(
          request.data?.serviceName,
        );
      }
      return defaultResponse;
    } catch (error) {
      this.logger.err(error as Error);
      return defaultResponse.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to trigger health checks.",
      );
    }
  }
}
