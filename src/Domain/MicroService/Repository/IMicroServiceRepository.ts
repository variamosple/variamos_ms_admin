import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { MicroServiceDetailed } from "../Entity/MicroServiceDetailed.js";
import type { MicroServiceFilter } from "../Entity/MicroServiceFilter.js";
import type {
  MicroServiceHealthInfo,
  MicroServiceUptimeSummary,
} from "../Entity/MicroServiceHealth.js";
import type { ServiceDefinition } from "../Entity/ServiceDefinition.js";

/** The monitored services and their health checks. */
export interface IMicroServiceRepository {
  queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroServiceDetailed[]>>;

  queryByName(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceDetailed>>;

  getHealthHistory(
    request: RequestModel<{ serviceName: string; days?: number }>,
  ): Promise<ResponseModel<MicroServiceUptimeSummary>>;

  recordHealthCheck(healthInfo: MicroServiceHealthInfo): Promise<void>;

  /** The monitored services, discovered from the running containers. */
  discoverServiceDefinitions(): Promise<ServiceDefinition[]>;
}
