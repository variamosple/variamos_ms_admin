import {
  isConfigurationApplied,
  refusalOfConfigurationValue,
} from "./AppliedConfigurationKeys.js";

describe("isConfigurationApplied", () => {
  it.each([
    "monitoring.health_check_interval_seconds",
    "security.password.min_length",
    "security.password.require_uppercase",
    "security.password.require_numbers",
    "security.password.require_special",
    "security.password.reset_expiry",
    "security.lockout.max_attempts",
    "security.lockout.duration_minutes",
    "security.mfa.trusted_device_days",
    "security.bcrypt_salt_rounds",
    "security.alerts.failed_sign_ins.max_attempts",
    "security.alerts.failed_sign_ins.window_minutes",
    "security.alerts.mass_operations.max_operations",
    "security.alerts.mass_operations.window_minutes",
    "security.alerts.cooldown_minutes",
    "security.alerts.off_hours",
    "security.alerts.timezone",
    "bugs.sync_interval_minutes",
    "bugs.rejected_retention_days",
  ])("%s is read by the code", (key) => {
    expect(isConfigurationApplied(key)).toBe(true);
  });

  it.each([
    "security.mfa.global_enabled",
    "security.cookie.max_age",
    "general.site_name",
    "notification.smtp.host",
  ])("%s has no effect yet", (key) => {
    expect(isConfigurationApplied(key)).toBe(false);
  });
});

/**
 * The bounds are those the code reading each key uses: a value outside them
 * would be replaced by a default, so the save refuses it (EV-18).
 */
describe("refusalOfConfigurationValue", () => {
  it.each([
    ["monitoring.health_check_interval_seconds", 5, 86400],
    ["security.password.min_length", 8, 64],
    ["security.password.reset_expiry", 1, 3600000],
    ["security.lockout.max_attempts", 3, 100],
    ["security.lockout.duration_minutes", 1, 1440],
    ["security.mfa.trusted_device_days", 0, 90],
    ["security.bcrypt_salt_rounds", 10, 14],
    ["security.alerts.failed_sign_ins.max_attempts", 3, 1000],
    ["security.alerts.failed_sign_ins.window_minutes", 1, 1440],
    ["security.alerts.mass_operations.max_operations", 5, 1000],
    ["security.alerts.mass_operations.window_minutes", 1, 1440],
    ["security.alerts.cooldown_minutes", 1, 1440],
    ["bugs.sync_interval_minutes", 5, 1440],
    ["bugs.rejected_retention_days", 1, 365],
  ])("%s accepts a whole number from %i to %i", (key, min, max) => {
    expect(refusalOfConfigurationValue(key, min)).toBeNull();
    expect(refusalOfConfigurationValue(key, max)).toBeNull();
    for (const refused of [min - 1, max + 1, min + 0.5, String(min)]) {
      expect(refusalOfConfigurationValue(key, refused)).toContain(
        `expects a whole number of`,
      );
    }
    expect(refusalOfConfigurationValue(key, min - 1)).toContain(
      `from ${min} to ${max}`,
    );
  });

  it.each([
    "security.password.require_uppercase",
    "security.password.require_numbers",
    "security.password.require_special",
  ])("%s accepts true or false only", (key) => {
    expect(refusalOfConfigurationValue(key, false)).toBeNull();
    expect(refusalOfConfigurationValue(key, "yes")).toBe(
      `Configuration '${key}' expects true or false.`,
    );
  });

  it("accepts an off-hours span or nothing, and a known time zone", () => {
    const offHours = "security.alerts.off_hours";
    const timeZone = "security.alerts.timezone";

    expect(refusalOfConfigurationValue(offHours, "")).toBeNull();
    expect(refusalOfConfigurationValue(offHours, "20:00-07:00")).toBeNull();
    expect(refusalOfConfigurationValue(offHours, "20:00-20:00")).not.toBeNull();
    expect(refusalOfConfigurationValue(offHours, "8pm-7am")).not.toBeNull();
    expect(refusalOfConfigurationValue(timeZone, "America/Bogota")).toBeNull();
    expect(refusalOfConfigurationValue(timeZone, "")).not.toBeNull();
    expect(
      refusalOfConfigurationValue(timeZone, "Mars/Olympus"),
    ).not.toBeNull();
  });

  it("lets any value through for a key that no code reads", () => {
    expect(refusalOfConfigurationValue("general.site_name", 42)).toBeNull();
  });
});
