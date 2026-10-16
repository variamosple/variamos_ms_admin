import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";

export type MicroServiceConfigValueType =
  | "string"
  | "number"
  | "boolean"
  | "json";

export class MicroServiceConfigItem {
  public constructor(
    public readonly id: number | undefined,
    public readonly serviceName: string,
    public readonly key: string,
    public readonly value: string,
    public readonly type: MicroServiceConfigValueType,
    public readonly isSecret: boolean,
    public readonly isReadOnly: boolean,
    public readonly description?: string,
    public readonly updatedBy?: string,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {
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
