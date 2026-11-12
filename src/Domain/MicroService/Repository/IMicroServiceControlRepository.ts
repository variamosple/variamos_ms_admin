import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { MicroServiceAuditEntry } from "../Entity/MicroServiceAuditEntry.js";

/** Actions on the services, their logs, and the audit log of the actions. */
export interface IMicroServiceControlRepository {
  /** `actorId` identifies who asked for the action, for the audit log. */
  startMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>>;

  stopMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>>;

  restartMicroService(
    request: RequestModel<string>,
    actorId: string,
  ): Promise<ResponseModel<void>>;

  watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>>;

  queryAuditLogs(
    request: RequestModel<{ serviceName: string; limit?: number }>,
  ): Promise<ResponseModel<MicroServiceAuditEntry[]>>;

  triggerHealthChecks?(serviceName?: string): Promise<unknown>;
}
