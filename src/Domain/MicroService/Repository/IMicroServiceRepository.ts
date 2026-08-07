import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { MicroService } from "../Entity/MicroService.js";
import type { MicroServiceFilter } from "../Entity/MicroServiceFilter.js";

export interface IMicroServiceRepository {
  queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>>;
  queryById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroService>>;
  startMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>>;
  stopMicroService(request: RequestModel<string>): Promise<ResponseModel<void>>;
  restartMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>>;
  watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>>;
}
