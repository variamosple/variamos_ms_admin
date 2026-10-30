import { isConfigurationApplied } from "./AppliedConfigurationKeys.js";

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
    "security.bcrypt_salt_rounds",
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
