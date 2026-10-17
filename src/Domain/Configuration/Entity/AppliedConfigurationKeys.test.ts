import { isConfigurationApplied } from "./AppliedConfigurationKeys.js";

describe("isConfigurationApplied", () => {
  it.each([
    "monitoring.health_check_interval_seconds",
    "security.password.min_length",
    "security.password.require_uppercase",
    "security.password.require_numbers",
    "security.password.require_special",
    "security.password.reset_expiry",
  ])("%s is read by the code", (key) => {
    expect(isConfigurationApplied(key)).toBe(true);
  });

  it.each([
    "security.mfa.global_enabled",
    "security.cookie.max_age",
    "security.bcrypt_salt_rounds",
    "general.site_name",
    "notification.smtp.host",
  ])("%s has no effect yet", (key) => {
    expect(isConfigurationApplied(key)).toBe(false);
  });
});
