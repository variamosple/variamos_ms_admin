import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { MicroServiceAuditEntry } from "../Entity/MicroServiceAuditEntry.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import type { MicroServiceDetailed } from "../Entity/MicroServiceDetailed.js";
import type { MicroServiceFilter } from "../Entity/MicroServiceFilter.js";
import type { MicroServiceUptimeSummary } from "../Entity/MicroServiceHealth.js";
import type { MicroServiceRepositories } from "../Repository/MicroServiceRepositories.js";

export class MicroServiceQueryUseCase {
  public constructor(private readonly repositories: MicroServiceRepositories) {}

  public queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroServiceDetailed[]>> {
    return this.repositories.services.queryMicroServices(request);
  }

  public async queryByName(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceDetailed>> {
    if (!request.data || request.data.trim() === "") {
      return new ResponseModel<MicroServiceDetailed>(
        request.transactionId,
      ).withError(
        DomainErrorCodes.INVALID_INPUT,
        "Microservice name is required.",
      );
    }
    return await this.repositories.services.queryByName(request);
  }

  public async getHealthHistory(
    request: RequestModel<{ serviceName: string; days?: number }>,
  ): Promise<ResponseModel<MicroServiceUptimeSummary>> {
    if (!request.data?.serviceName) {
      return new ResponseModel<MicroServiceUptimeSummary>(
        request.transactionId,
      ).withError(DomainErrorCodes.INVALID_INPUT, "Service name is required.");
    }
    return await this.repositories.services.getHealthHistory(request);
  }

  public async queryConfigurations(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceConfigItem[]>> {
    if (!request.data || request.data.trim() === "") {
      return new ResponseModel<MicroServiceConfigItem[]>(
        request.transactionId,
      ).withError(DomainErrorCodes.INVALID_INPUT, "Service name is required.");
    }
    return await this.repositories.configuration.queryConfigurations(request);
  }

  public async queryAuditLogs(
    request: RequestModel<{ serviceName: string; limit?: number }>,
  ): Promise<ResponseModel<MicroServiceAuditEntry[]>> {
    if (!request.data?.serviceName) {
      return new ResponseModel<MicroServiceAuditEntry[]>(
        request.transactionId,
      ).withError(DomainErrorCodes.INVALID_INPUT, "Service name is required.");
    }
    return await this.repositories.control.queryAuditLogs(request);
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const defaultResponse = new ResponseModel<NodeJS.ReadableStream>(
      request.transactionId,
    );

    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    return await this.repositories.control.watchMicroServiceLogs(request);
  }
}
