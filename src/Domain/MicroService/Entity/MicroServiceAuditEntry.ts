import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";

export class MicroServiceAuditEntry {
  public constructor(
    public readonly id: number | undefined,
    public readonly serviceName: string,
    public readonly actionType: string,
    public readonly details: Record<string, unknown>,
    public readonly performedBy: string,
    public readonly createdAt: Date,
  ) {
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
    return new MicroServiceAuditEntry(
      this.id,
      this.serviceName,
      this.actionType,
      { ...this.details, newValue: SECRET_MASK },
      this.performedBy,
      this.createdAt,
    );
  }
}
