import { Op } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";
import { MicroServiceConfigItem } from "#src/Domain/MicroService/Entity/MicroServiceConfigItem.js";
import type { IMicroServiceConfigRepository } from "#src/Domain/MicroService/Repository/IMicroServiceConfigRepository.js";
import {
  type ConfigurationUpdateRefusal,
  type ConfigurationValueType,
  readConfigurationValue,
  refuseConfigurationUpdate,
} from "#src/Domain/MicroService/Service/ConfigurationUpdateRule.js";
import {
  ConfigurationModel,
  type ConfigurationValue,
} from "../Configuration/Configuration.js";
import type { SecretConfigurationValue } from "../Configuration/SecretConfigurationValue.js";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";

/** A new value for a key of a service, and who sets it. */
interface ServiceConfigurationChange {
  serviceName: string;
  key: string;
  value: string;
  operatorId: string;
}

/**
 * The value of a new key and its type, read as JSON; a text that is not a
 * number, a boolean, an array or an object stays a string.
 */
function parseNewValue(value: string): {
  parsedValue: ConfigurationValue;
  detectedType: ConfigurationValueType;
} {
  let parsedValue: ConfigurationValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    return { parsedValue: value, detectedType: "string" };
  }
  if (typeof parsedValue === "number") {
    return { parsedValue, detectedType: "number" };
  }
  if (typeof parsedValue === "boolean") {
    return { parsedValue, detectedType: "boolean" };
  }
  if (Array.isArray(parsedValue)) return { parsedValue, detectedType: "array" };
  if (typeof parsedValue === "object" && parsedValue !== null) {
    return { parsedValue, detectedType: "object" };
  }
  return { parsedValue: value, detectedType: "string" };
}

// A key no service had: open to all environments, neither secret nor locked
function createServiceConfiguration(
  change: ServiceConfigurationChange,
): Promise<ConfigurationModel> {
  const { parsedValue, detectedType } = parseNewValue(change.value);
  return ConfigurationModel.create({
    key: change.key,
    value: parsedValue,
    type: detectedType,
    category: "env",
    requiresMfa: false,
    isSecret: false,
    environmentScope: "all",
    isReadOnly: false,
    targetServices: [change.serviceName],
    updatedBy: change.operatorId,
  });
}

/** The configuration of each service; a secret is stored encrypted and shown masked. */
export class MicroServiceConfigRepositoryImpl
  implements IMicroServiceConfigRepository
{
  private readonly secrets: SecretConfigurationValue;

  public constructor(config: { secrets: SecretConfigurationValue }) {
    this.secrets = config.secrets;
  }

  /** The value as text, in clear; the mask when a secret cannot be decrypted. */
  private displayedValueOf(config: ConfigurationModel): string {
    const value = config.isSecret
      ? (this.secrets.decrypt(config.key, config.value) ?? SECRET_MASK)
      : config.value;
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  public async queryConfigurations(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceConfigItem[]>> {
    const response = new ResponseModel<MicroServiceConfigItem[]>(
      request.transactionId,
    );
    const serviceName = request.data;
    if (!serviceName) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name is required",
      );
    }

    try {
      // Find configurations targeted to this specific service OR targeted to "all"
      const configs = await ConfigurationModel.findAll({
        where: {
          [Op.or]: [
            { targetServices: { [Op.contains]: [serviceName] } },
            { targetServices: { [Op.contains]: ["all"] } },
          ],
        },
        order: [["key", "ASC"]],
      });

      response.data = configs.map((c) => this.configItemOf(c, serviceName));
      response.totalCount = configs.length;
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to query configurations",
      );
    }

    return response;
  }

  public async updateConfiguration(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string;
      operatorId: string;
    }>,
  ): Promise<ResponseModel<MicroServiceConfigItem>> {
    const response = new ResponseModel<MicroServiceConfigItem>(
      request.transactionId,
    );
    if (!request.data?.serviceName || !request.data?.key) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name and key are required",
      );
    }
    const { serviceName, key, value, operatorId } = request.data;

    try {
      const existing = await ConfigurationModel.findOne({ where: { key } });
      const refusal = refuseConfigurationUpdate(key, value, existing);
      if (refusal) {
        return response.withError(refusal.errorCode, refusal.message);
      }

      const change = { serviceName, key, value, operatorId };
      let config: ConfigurationModel;
      if (existing) {
        const failure = await this.writeExisting(existing, change);
        if (failure)
          return response.withError(failure.errorCode, failure.message);
        config = existing;
      } else {
        config = await createServiceConfiguration(change);
      }

      await MicroServiceAuditLogModel.create({
        serviceName,
        actionType: "CONFIG_UPDATE",
        // A secret value is never written to the audit log
        details: { key, newValue: existing?.isSecret ? SECRET_MASK : value },
        performedBy: operatorId,
      });

      response.data = this.configItemOf(config, serviceName);
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to update configuration",
      );
    }

    return response;
  }

  /** Writes the new value of a known key; the refusal when it cannot. */
  private async writeExisting(
    existing: ConfigurationModel,
    change: ServiceConfigurationChange,
  ): Promise<ConfigurationUpdateRefusal | null> {
    const { serviceName, key, value, operatorId } = change;
    // The refusal checked before has made sure that the value matches the
    // key's type
    const parsedValue = readConfigurationValue(value, existing.type);
    if (parsedValue === undefined) {
      return {
        errorCode: DomainErrorCodes.INVALID_INPUT,
        message: `The value does not match the type of '${key}'.`,
      };
    }
    // A secret is never written in clear (T-13)
    if (existing.isSecret && !this.secrets.canEncrypt()) {
      return {
        errorCode: DomainErrorCodes.UNAVAILABLE,
        message:
          "Secret configurations cannot be changed: no encryption key is configured.",
      };
    }
    const targetServices = Array.from(
      new Set([...existing.targetServices, serviceName]),
    );
    await existing.update({
      value: existing.isSecret
        ? this.secrets.encrypt(key, parsedValue)
        : parsedValue,
      targetServices,
      updatedBy: operatorId,
    });
    return null;
  }

  // A configuration as the service's configuration list shows it
  private configItemOf(
    config: ConfigurationModel,
    serviceName: string,
  ): MicroServiceConfigItem {
    return new MicroServiceConfigItem({
      id: config.id,
      serviceName,
      key: config.key,
      value: this.displayedValueOf(config),
      type: config.type || "string",
      isSecret: config.isSecret,
      isReadOnly: config.isReadOnly,
      description: config.description,
      updatedBy: config.updatedBy,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  }
}
