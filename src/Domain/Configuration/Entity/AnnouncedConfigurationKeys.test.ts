import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import { PASSWORD_POLICY_KEYS } from "#src/Domain/User/Service/PasswordPolicyService.js";
import {
  announcementOf,
  isAnnouncedConfiguration,
} from "./AnnouncedConfigurationKeys.js";
import { isConfigurationApplied } from "./AppliedConfigurationKeys.js";

const ANNOUNCED = [
  ...Object.values(PASSWORD_POLICY_KEYS),
  ...Object.values(ACCOUNT_LOCKOUT_KEYS),
  TRUSTED_DEVICE_DAYS_KEY,
];

describe("AnnouncedConfigurationKeys (EV-115 lot A)", () => {
  it("offers an announcement for the settings users notice, all applied by the code", () => {
    for (const key of ANNOUNCED) {
      expect(isAnnouncedConfiguration(key)).toBe(true);
      // Announcing a setting that no code reads would mislead users
      expect(isConfigurationApplied(key)).toBe(true);
    }
  });

  it.each([
    "security.password.reset_expiry",
    "security.alerts.off_hours",
    "site.name",
  ])("offers none for %s", (key) => {
    expect(isAnnouncedConfiguration(key)).toBe(false);
    expect(announcementOf(key, 12)).toBeNull();
  });

  it("says what a password rule asks, and that current passwords keep working", () => {
    expect(announcementOf(PASSWORD_POLICY_KEYS.minLength, 14)).toEqual({
      title: "Password rules updated",
      body: "Passwords must now have at least 14 characters. It applies when you next choose a password; your current password keeps working.",
    });
    expect(
      announcementOf(PASSWORD_POLICY_KEYS.requireSpecial, true)?.body,
    ).toMatch(/^Passwords must now contain a special character\./);
    expect(
      announcementOf(PASSWORD_POLICY_KEYS.requireUppercase, false)?.body,
    ).toMatch(/^Passwords no longer need an uppercase letter\./);
  });

  it("says how the sign-in protection now behaves", () => {
    expect(announcementOf(ACCOUNT_LOCKOUT_KEYS.maxAttempts, 5)?.body).toBe(
      "An account is now locked after 5 failed sign-in attempts.",
    );
    expect(announcementOf(ACCOUNT_LOCKOUT_KEYS.durationMinutes, 30)?.body).toBe(
      "A locked account now stays locked for 30 minutes.",
    );
    expect(announcementOf(TRUSTED_DEVICE_DAYS_KEY, 0)?.body).toBe(
      "The two-factor sign-in code is now asked at every sign-in, on every browser.",
    );
    expect(announcementOf(TRUSTED_DEVICE_DAYS_KEY, 14)?.body).toContain(
      "for 14 days",
    );
  });

  it.each([
    [PASSWORD_POLICY_KEYS.minLength, "14"],
    [PASSWORD_POLICY_KEYS.requireNumbers, "true"],
    [ACCOUNT_LOCKOUT_KEYS.maxAttempts, 2.5],
    [TRUSTED_DEVICE_DAYS_KEY, null],
  ])("suggests nothing for %s set to %j", (key, value) => {
    expect(announcementOf(key, value)).toBeNull();
  });
});
