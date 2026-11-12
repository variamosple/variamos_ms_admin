import type { ActivityValues } from "#src/Domain/Activity/ActivityEntry.js";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import {
  type ActivityDescription,
  withJournal,
} from "#src/Domain/Activity/withJournal.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "#src/Domain/Configuration/Event/IConfigEventPublisher.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import { isRunning } from "../Entity/MicroServiceHealth.js";
import type { MicroServiceRepositories } from "../Repository/MicroServiceRepositories.js";

export const SCALING_NOT_AVAILABLE =
  "Scaling is not available: the number of replicas is set in the server's compose file.";

/** What the management of the services reads and records. */
export interface MicroServiceManagementUseCaseDependencies {
  repositories: MicroServiceRepositories;
  logger: ILogger;
  configurationRepository: Pick<IConfigurationRepository, "queryByKey">;
  configEventPublisher: IConfigEventPublisher;
  journal: IActivityJournal;
}

export class MicroServiceManagementUseCase {
  private readonly repositories: MicroServiceRepositories;
  private readonly logger: ILogger;
  private readonly configurationRepository: Pick<
    IConfigurationRepository,
    "queryByKey"
  >;
  private readonly configEventPublisher: IConfigEventPublisher;
  private readonly journal: IActivityJournal;

  public constructor(dependencies: MicroServiceManagementUseCaseDependencies) {
    const {
      repositories,
      logger,
      configurationRepository,
      configEventPublisher,
      journal,
    } = dependencies;
    this.repositories = repositories;
    this.logger = logger;
    this.configurationRepository = configurationRepository;
    this.configEventPublisher = configEventPublisher;
    this.journal = journal;
  }

  public async startMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.actionOn("micro-service.start", request, actorId),
      () => this.applyStartMicroService(request, actorId),
    );
  }

  private async applyStartMicroService(
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

    if (this.repositories.services.queryByName) {
      const queryResponse =
        await this.repositories.services.queryByName(request);
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

    return this.repositories.control.startMicroService(request, actorId);
  }

  public async stopMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.actionOn("micro-service.stop", request, actorId),
      () => this.applyStopMicroService(request, actorId),
    );
  }

  private async applyStopMicroService(
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

    if (this.repositories.services.queryByName) {
      const queryResponse =
        await this.repositories.services.queryByName(request);
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

    return this.repositories.control.stopMicroService(request, actorId);
  }

  public async restartMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.actionOn("micro-service.restart", request, actorId),
      () => this.applyRestartMicroService(request, actorId),
    );
  }

  private async applyRestartMicroService(
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

    if (this.repositories.services.queryByName) {
      const queryResponse =
        await this.repositories.services.queryByName(request);
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

    return this.repositories.control.restartMicroService(request, actorId);
  }

  // Start, stop and restart appear in the activity journal with their real
  // author, as the other administration operations (EV-86 lot 3)
  private actionOn(
    action: string,
    request: RequestModel<string>,
    actorId: string,
  ): ActivityDescription {
    return {
      actorId,
      action,
      entityType: "micro-service",
      entityId: request.data,
      transactionId: request.transactionId,
    };
  }

  // The replicas are set in the server's compose file: answering success
  // without acting would mislead the operator (T-25, decision D3)
  public scaleMicroService(
    request: RequestModel<{ serviceName: string }>,
  ): Promise<ResponseModel<void>> {
    return Promise.resolve(
      new ResponseModel<void>(request.transactionId).withError(
        DomainErrorCodes.NOT_IMPLEMENTED,
        SCALING_NOT_AVAILABLE,
      ),
    );
  }

  public async updateConfiguration(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string | undefined;
      operatorId: string;
    }>,
  ): Promise<ResponseModel<MicroServiceConfigItem>> {
    // Recorded as from the configuration page, display values only (EV-70)
    let change: { before: ActivityValues | null; after: ActivityValues };
    return await withJournal(
      this.journal,
      {
        actorId: request.data?.operatorId,
        action: "configuration.update",
        entityType: "configuration",
        entityId: request.data?.key,
        transactionId: request.transactionId,
      },
      () =>
        this.applyConfigurationUpdate(request, (before, after) => {
          change = { before, after };
        }),
      () => change ?? {},
    );
  }

  private async applyConfigurationUpdate(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string | undefined;
      operatorId: string;
    }>,
    onChange: (before: ActivityValues | null, after: ActivityValues) => void,
  ): Promise<ResponseModel<MicroServiceConfigItem>> {
    const defaultResponse = new ResponseModel<MicroServiceConfigItem>(
      request.transactionId,
    );
    const data = request.data;
    if (!data?.serviceName || !data.key || data.value === undefined) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name, key and value are required.",
      );
    }
    const { key } = data;
    const before = await this.readConfiguration(request.transactionId, key);
    const response = await this.repositories.configuration.updateConfiguration(
      new RequestModel(
        request.transactionId,
        { ...data, value: data.value },
        request.actorId,
      ),
    );
    if (response.errorCode) return response;

    const updated = await this.readConfiguration(request.transactionId, key);
    if (updated) {
      onChange(before ? { value: before.getDisplayValue() } : null, {
        value: updated.getDisplayValue(),
      });
      // As after an update from the configuration page, so that what follows
      // a key (the health check interval) sees the new value
      await this.configEventPublisher.publishConfigUpdated(updated);
    } else {
      this.logger.warn(
        `Event config.updated not published: configuration '${key}' could not be read back.`,
      );
    }
    return response;
  }

  /** The stored configuration, or null when the key does not exist yet. */
  private async readConfiguration(
    transactionId: string | undefined,
    key: string,
  ): Promise<Configuration | null> {
    const stored = await this.configurationRepository.queryByKey(
      new RequestModel(transactionId, key),
    );
    return stored.data ?? null;
  }

  public async triggerHealthChecks(
    request: RequestModel<{ serviceName?: string }>,
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    try {
      if (this.repositories.control.triggerHealthChecks) {
        await this.repositories.control.triggerHealthChecks(
          request.data?.serviceName,
        );
      }
      return defaultResponse;
    } catch (error) {
      this.logger.err(error);
      return defaultResponse.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to trigger health checks.",
      );
    }
  }
}
