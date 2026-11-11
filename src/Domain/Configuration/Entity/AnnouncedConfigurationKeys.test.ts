import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import { PASSWORD_POLICY_KEYS } from "#src/Domain/User/Service/PasswordPolicyService.js";
import {
  announcedInstant,
  announcementOf,
  cancellationOf,
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
      body: "Passwords must now have at least 14 characters.",
      note: "The rules apply when you next choose a password; your current password keeps working.",
    });
    expect(
      announcementOf(PASSWORD_POLICY_KEYS.requireSpecial, true)?.body,
    ).toBe("Passwords must now contain a special character.");
    expect(
      announcementOf(PASSWORD_POLICY_KEYS.requireUppercase, false)?.body,
    ).toBe("Passwords no longer need an uppercase letter.");
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
    expect(announcementOf(TRUSTED_DEVICE_DAYS_KEY, 14)).toEqual({
      title: "Two-factor sign-in updated",
      body: "A browser you choose to trust can now skip the two-factor sign-in code for 14 days.",
      note: "Browsers already trusted follow the new delay.",
    });
  });

  it.each([
    [PASSWORD_POLICY_KEYS.minLength, "14"],
    [PASSWORD_POLICY_KEYS.requireNumbers, "true"],
    [ACCOUNT_LOCKOUT_KEYS.maxAttempts, 2.5],
    [TRUSTED_DEVICE_DAYS_KEY, null],
  ])("suggests nothing for %s set to %j", (key, value) => {
    expect(announcementOf(key, value)).toBeNull();
  });

  describe("from a later date (EV-115 lot B)", () => {
    const FROM = new Date("2026-11-15T13:05:00Z");

    it("says the date in UTC", () => {
      expect(announcedInstant(FROM)).toBe("15 November 2026 at 13:05 UTC");
      expect(announcedInstant(new Date("2027-01-02T08:00:00+05:00"))).toBe(
        "2 January 2027 at 03:00 UTC",
      );
    });

    it.each([
      [
        PASSWORD_POLICY_KEYS.minLength,
        14,
        "From 15 November 2026 at 13:05 UTC, passwords must have at least 14 characters.",
      ],
      [
        PASSWORD_POLICY_KEYS.requireNumbers,
        true,
        "From 15 November 2026 at 13:05 UTC, passwords must contain a number.",
      ],
      [
        PASSWORD_POLICY_KEYS.requireUppercase,
        false,
        "From 15 November 2026 at 13:05 UTC, passwords no longer need an uppercase letter.",
      ],
      [
        ACCOUNT_LOCKOUT_KEYS.maxAttempts,
        5,
        "From 15 November 2026 at 13:05 UTC, an account is locked after 5 failed sign-in attempts.",
      ],
      [
        ACCOUNT_LOCKOUT_KEYS.durationMinutes,
        30,
        "From 15 November 2026 at 13:05 UTC, a locked account stays locked for 30 minutes.",
      ],
      [
        TRUSTED_DEVICE_DAYS_KEY,
        0,
        "From 15 November 2026 at 13:05 UTC, the two-factor sign-in code is asked at every sign-in, on every browser.",
      ],
      [
        TRUSTED_DEVICE_DAYS_KEY,
        7,
        "From 15 November 2026 at 13:05 UTC, a browser you choose to trust can skip the two-factor sign-in code for 7 days.",
      ],
    ])("announces %s set to %j ahead", (key, value, body) => {
      expect(announcementOf(key, value, FROM)?.body).toBe(body);
    });

    it("keeps the title and the note of the setting", () => {
      expect(announcementOf(PASSWORD_POLICY_KEYS.minLength, 14, FROM)).toEqual(
        expect.objectContaining({
          title: "Password rules updated",
          note: "The rules apply when you next choose a password; your current password keeps working.",
        }),
      );
    });

    it("tells that a planned change will not happen", () => {
      expect(cancellationOf(ACCOUNT_LOCKOUT_KEYS.maxAttempts, FROM)).toEqual({
        title: "Planned change cancelled",
        body: "The change to the sign-in protection announced for 15 November 2026 at 13:05 UTC will not happen.",
      });
      expect(cancellationOf("site.name", FROM)).toBeNull();
    });
  });
});
