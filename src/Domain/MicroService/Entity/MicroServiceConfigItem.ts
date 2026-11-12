import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";
import type { ConfigurationValueType } from "../Service/ConfigurationUpdateRule.js";

// The type of the setting, as in the configurations table
export type MicroServiceConfigValueType = ConfigurationValueType;

/** What a parameter of a service is made of. */
export interface MicroServiceConfigItemFields {
  id?: number;
  serviceName: string;
  key: string;
  value: string;
  type: MicroServiceConfigValueType;
  isSecret: boolean;
  isReadOnly: boolean;
  description?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MicroServiceConfigItem {
  public readonly id: number | undefined;
  public readonly serviceName: string;
  public readonly key: string;
  public readonly value: string;
  public readonly type: MicroServiceConfigValueType;
  public readonly isSecret: boolean;
  public readonly isReadOnly: boolean;
  public readonly description?: string;
  public readonly updatedBy?: string;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  public constructor(fields: MicroServiceConfigItemFields) {
    const {
      id,
      serviceName,
      key,
      value,
      type,
      isSecret,
      isReadOnly,
      description,
      updatedBy,
      createdAt,
      updatedAt,
    } = fields;
    this.id = id;
    this.serviceName = serviceName;
    this.key = key;
    this.value = value;
    this.type = type;
    this.isSecret = isSecret;
    this.isReadOnly = isReadOnly;
    this.description = description;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    if (!serviceName || serviceName.trim() === "") {
      throw new Error("Service name is required");
    }
    if (!key || key.trim() === "") {
      throw new Error("Config key is required");
    }
  }

  public getDisplayValue(): string {
    if (this.isSecret) {
      return SECRET_MASK;
    }
    return this.value;
  }

  /**
   * Serialized form, used by every HTTP response: a secret value is always
   * replaced by the mask, so it cannot leave the API by mistake.
   */
  public toJSON() {
    return {
      id: this.id,
      serviceName: this.serviceName,
      key: this.key,
      value: this.getDisplayValue(),
      type: this.type,
      isSecret: this.isSecret,
      isReadOnly: this.isReadOnly,
      description: this.description,
      updatedBy: this.updatedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
