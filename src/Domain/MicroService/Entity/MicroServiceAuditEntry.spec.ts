import { MicroServiceAuditEntry } from "./MicroServiceAuditEntry.js";

const entry = (details: Record<string, unknown>) =>
  new MicroServiceAuditEntry(
    7,
    "variamos_ms_notifications",
    "CONFIG_UPDATE",
    details,
    "admin@example.com",
    new Date("2026-10-16T00:00:00Z"),
  );

describe("MicroServiceAuditEntry.withSecretsMasked", () => {
  const secretKeys = new Set(["notification.smtp.password"]);

  it("masks the value of a secret configuration update", () => {
    const masked = entry({
      key: "notification.smtp.password",
      newValue: "smtp-password-value",
    }).withSecretsMasked(secretKeys);

    expect(masked.details).toEqual({
      key: "notification.smtp.password",
      newValue: "********",
    });
    expect(masked.performedBy).toBe("admin@example.com");
  });

  it("keeps the value of a non-secret update", () => {
    const original = entry({ key: "monitoring.interval", newValue: "30" });

    expect(original.withSecretsMasked(secretKeys)).toBe(original);
  });

  it("keeps entries without a configuration value", () => {
    const original = entry({ target: "variamos_ms_notifications" });

    expect(original.withSecretsMasked(secretKeys)).toBe(original);
  });
});
