import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type {
  Configuration,
  ConfigurationValue,
} from "../Entity/Configuration.js";

export interface ConfigurationFilter {
  category?: string;
  environmentScope?: string;
}

export interface UpdateConfigurationDto {
  key: string;
  value: ConfigurationValue;
  operatorId: string;
}

export interface IConfigurationRepository {
  queryConfigurations(
    request: RequestModel<ConfigurationFilter>,
  ): Promise<ResponseModel<Configuration[]>>;

  queryByKey(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Configuration>>;

  updateConfiguration(
    request: RequestModel<UpdateConfigurationDto>,
  ): Promise<ResponseModel<Configuration>>;
}
