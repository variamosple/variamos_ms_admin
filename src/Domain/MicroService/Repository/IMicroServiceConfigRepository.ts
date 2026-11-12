import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { MicroServiceConfigItem } from "../Entity/MicroServiceConfigItem.js";

/** The configuration of each service. */
export interface IMicroServiceConfigRepository {
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
}
