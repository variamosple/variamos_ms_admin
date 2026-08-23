import {
  Configuration,
  ConfigurationKey,
  type EnvironmentScope,
} from "@src/Domain/Configuration/Entity/Configuration.js";
import type {
  ConfigurationFilter,
  IConfigurationRepository,
  UpdateConfigurationDto,
} from "@src/Domain/Configuration/Repository/IConfigurationRepository.js";
import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import logger from "jet-logger";
import type { WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository.js";
import { ConfigurationModel } from "./Configuration.js";

export class ConfigurationRepositoryImpl
  extends BaseRepository
  implements IConfigurationRepository
{
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
      logger.err(request);
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
      logger.err(request);
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

      await ConfigurationModel.update(
        {
          value,
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
      logger.err(request);
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  private mapToDomain(model: ConfigurationModel): Configuration {
    return Configuration.builder()
      .setId(model.id)
      .setKey(new ConfigurationKey(model.key))
      .setValue(model.value)
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
