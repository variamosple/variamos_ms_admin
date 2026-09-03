import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { MicroServiceAuditEntry } from "../Entity/MicroServiceAuditEntry.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";
import type { MicroServiceDetailed } from "../Entity/MicroServiceDetailed.js";
import type { MicroServiceFilter } from "../Entity/MicroServiceFilter.js";
import type {
  MicroServiceHealthInfo,
  MicroServiceUptimeSummary,
} from "../Entity/MicroServiceHealth.js";

export interface IMicroServiceRepository {
  queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroServiceDetailed[]>>;

  queryByName(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceDetailed>>;

  startMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>>;

  stopMicroService(request: RequestModel<string>): Promise<ResponseModel<void>>;

  restartMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>>;

  scaleMicroService(
    request: RequestModel<{ serviceName: string; replicas: number }>,
  ): Promise<ResponseModel<void>>;

  watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>>;

  getHealthHistory(
    request: RequestModel<{ serviceName: string; days?: number }>,
  ): Promise<ResponseModel<MicroServiceUptimeSummary>>;

  recordHealthCheck(healthInfo: MicroServiceHealthInfo): Promise<void>;

  queryConfigurations(
    request: RequestModel<string>, // serviceName
  ): Promise<ResponseModel<MicroServiceConfigItem[]>>;

  updateConfiguration(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string;
      operatorId: string;
    }>,
  ): Promise<ResponseModel<MicroServiceConfigItem>>;

  queryAuditLogs(
    request: RequestModel<{ serviceName: string; limit?: number }>,
  ): Promise<ResponseModel<MicroServiceAuditEntry[]>>;
}
