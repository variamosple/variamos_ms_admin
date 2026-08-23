import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  Configuration,
  ConfigurationValue,
} from "../Entity/Configuration.js";
import type {
  ConfigurationFilter,
  IConfigurationRepository,
} from "../Repository/IConfigurationRepository.js";

export interface UpdateConfigurationRequest {
  key: string;
  value: ConfigurationValue;
  operatorId: string;
  isMfaVerified?: boolean;
}

export class ConfigurationUseCase {
  public constructor(
    private readonly configurationRepository: IConfigurationRepository,
  ) {}

  public async queryConfigurations(
    request: RequestModel<ConfigurationFilter>,
  ): Promise<ResponseModel<Configuration[]>> {
    return this.configurationRepository.queryConfigurations(request);
  }

  public async queryByKey(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Configuration>> {
    return this.configurationRepository.queryByKey(request);
  }

  public async updateConfiguration(
    request: RequestModel<UpdateConfigurationRequest>,
  ): Promise<ResponseModel<Configuration>> {
    const transactionId = request.transactionId;
    const response = new ResponseModel<Configuration>(transactionId);

    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }

    const { key, value, operatorId, isMfaVerified } = request.data;

    // 1. Fetch current configuration to check its security metadata
    const queryRequest = new RequestModel<string>(transactionId, key);
    const existingConfigResponse =
      await this.configurationRepository.queryByKey(queryRequest);

    if (existingConfigResponse.errorCode) {
      return response.copyErrorWithPromise(existingConfigResponse);
    }

    const configuration = existingConfigResponse.data;
    if (!configuration) {
      return response.withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        `Configuration with key '${key}' not found.`,
      );
    }

    // 2. Validate MFA if required
    if (configuration.requiresMfa && !isMfaVerified) {
      return response.withError(
        DomainErrorCodes.MFA_REQUIRED,
        `Updating configuration '${key}' requires MFA validation.`,
      );
    }

    // 3. Mutate domain entity state (validates type invariants and readonly flag)
    try {
      configuration.updateValue(value, operatorId);
    } catch (e) {
      const err = e as Error;
      return response.withError(DomainErrorCodes.INVALID_INPUT, err.message);
    }

    // 4. Persist updated configuration
    const updateRequest = new RequestModel(transactionId, {
      key,
      value,
      operatorId,
    });
    return this.configurationRepository.updateConfiguration(updateRequest);
  }
}
