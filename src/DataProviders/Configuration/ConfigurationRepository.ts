import logger from "jet-logger";
import type { WhereOptions } from "sequelize";
import {
  Configuration,
  ConfigurationKey,
  type ConfigurationValue,
  type EnvironmentScope,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import type {
  ConfigurationFilter,
  IConfigurationRepository,
  UpdateConfigurationDto,
} from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";
import { BaseRepository } from "../BaseRepository.js";
import { ConfigurationModel } from "./Configuration.js";
import type { SecretConfigurationValue } from "./SecretConfigurationValue.js";

export class ConfigurationRepositoryImpl
  extends BaseRepository
  implements IConfigurationRepository
{
  public constructor(private readonly secrets: SecretConfigurationValue) {
    super();
  }

  async queryConfigurations(
    request: RequestModel<ConfigurationFilter>,
  ): Promise<ResponseModel<Configuration[]>> {
    const response = new ResponseModel<Configuration[]>(request.transactionId);

    try {
      const { data: filter } = request;
      const where: WhereOptions = {};

      if (filter) {
        if (filter.category) {
          where.category = filter.category;
        }
        if (filter.environmentScope) {
          where.environmentScope = filter.environmentScope;
        }
      }

      const models = await ConfigurationModel.findAll({
        where,
        order: [["key", "ASC"]],
      });

      response.data = models.map((model) => this.mapToDomain(model));
    } catch (error) {
      logger.err("Error in queryConfigurations:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async queryByKey(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Configuration>> {
    const response = new ResponseModel<Configuration>(request.transactionId);

    try {
      const key = request.data;
      if (!key) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Configuration key is required.",
        );
      }

      const model = await ConfigurationModel.findOne({
        where: { key },
      });

      if (!model) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Configuration with key '${key}' not found.`,
        );
      }

      response.data = this.mapToDomain(model);
    } catch (error) {
      logger.err("Error in queryByKey:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async updateConfiguration(
    request: RequestModel<UpdateConfigurationDto>,
  ): Promise<ResponseModel<Configuration>> {
    const response = new ResponseModel<Configuration>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Configuration data is required.",
        );
      }

      const { key, value, operatorId } = data;

      const model = await ConfigurationModel.findOne({
        where: { key },
      });

      if (!model) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Configuration with key '${key}' not found.`,
        );
      }

      // A secret is never written in clear (T-13)
      if (model.isSecret && !this.secrets.canEncrypt()) {
        return response.withError(
          DomainErrorCodes.UNAVAILABLE,
          "Secret configurations cannot be changed: no encryption key is configured.",
        );
      }

      await ConfigurationModel.update(
        {
          value: model.isSecret ? this.secrets.encrypt(key, value) : value,
          updatedBy: operatorId,
        },
        { where: { key } },
      );

      // Reload to get updated timestamps and data
      const updatedModel = await ConfigurationModel.findOne({
        where: { key },
      });

      if (updatedModel) {
        response.data = this.mapToDomain(updatedModel);
      }
    } catch (error) {
      logger.err("Error in updateConfiguration:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  /** The value in clear; the mask when a secret cannot be decrypted. */
  private valueOf(model: ConfigurationModel): ConfigurationValue {
    if (!model.isSecret) return model.value;
    const value = this.secrets.decrypt(model.key, model.value);
    if (value === null) {
      logger.warn(
        `[Configuration] The secret '${model.key}' cannot be decrypted with the current key.`,
      );
      return SECRET_MASK;
    }
    return value;
  }

  private mapToDomain(model: ConfigurationModel): Configuration {
    return Configuration.builder()
      .setId(model.id)
      .setKey(new ConfigurationKey(model.key))
      .setValue(this.valueOf(model))
      .setType(model.type)
      .setCategory(model.category)
      .setRequiresMfa(model.requiresMfa)
      .setIsSecret(model.isSecret)
      .setEnvironmentScope(model.environmentScope as EnvironmentScope)
      .setIsReadOnly(model.isReadOnly)
      .setTargetServices(model.targetServices)
      .setDescription(model.description)
      .setUpdatedBy(model.updatedBy)
      .setCreatedAt(model.createdAt)
      .setUpdatedAt(model.updatedAt)
      .build();
  }
}
