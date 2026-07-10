import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "../Entity/MicroService";
import { MicroServiceFilter } from "../Entity/MicroServiceFilter";

export interface IMicroServiceRepository {
  queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<MicroService>>;
  startMicroService(request: RequestModel<string>): Promise<ResponseModel<void>>;
  stopMicroService(request: RequestModel<string>): Promise<ResponseModel<void>>;
  restartMicroService(request: RequestModel<string>): Promise<ResponseModel<void>>;
  watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>>;
}
