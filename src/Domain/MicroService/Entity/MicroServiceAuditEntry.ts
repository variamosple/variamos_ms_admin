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
}
