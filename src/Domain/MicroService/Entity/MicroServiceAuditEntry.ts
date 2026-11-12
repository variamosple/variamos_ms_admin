import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";

/** What an audit entry of a service records. */
export interface MicroServiceAuditEntryFields {
  id?: number;
  serviceName: string;
  actionType: string;
  details: Record<string, unknown>;
  performedBy: string;
  createdAt: Date;
}

export class MicroServiceAuditEntry {
  public readonly id: number | undefined;
  public readonly serviceName: string;
  public readonly actionType: string;
  public readonly details: Record<string, unknown>;
  public readonly performedBy: string;
  public readonly createdAt: Date;

  public constructor(fields: MicroServiceAuditEntryFields) {
    const { id, serviceName, actionType, details, performedBy, createdAt } =
      fields;
    this.id = id;
    this.serviceName = serviceName;
    this.actionType = actionType;
    this.details = details;
    this.performedBy = performedBy;
    this.createdAt = createdAt;
    if (!serviceName || serviceName.trim() === "") {
      throw new Error("Service name is required");
    }
    if (!actionType || actionType.trim() === "") {
      throw new Error("Action type is required");
    }
  }

  /**
   * Copy of the entry where the value of a configuration update is masked
   * when its key is secret. Older entries stored that value in clear.
   */
  public withSecretsMasked(
    secretKeys: ReadonlySet<string>,
  ): MicroServiceAuditEntry {
    const key = this.details.key;
    if (
      typeof key !== "string" ||
      !secretKeys.has(key) ||
      !("newValue" in this.details)
    ) {
      return this;
    }
    return new MicroServiceAuditEntry({
      id: this.id,
      serviceName: this.serviceName,
      actionType: this.actionType,
      details: { ...this.details, newValue: SECRET_MASK },
      performedBy: this.performedBy,
      createdAt: this.createdAt,
    });
  }
}
