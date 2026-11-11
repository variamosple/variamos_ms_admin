import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import { PASSWORD_POLICY_KEYS } from "#src/Domain/User/Service/PasswordPolicyService.js";

/** An announcement the interface offers to send, in English like it. */
export interface ConfigurationAnnouncement {
  title: string;
  body: string;
}

// The policy is checked when a password is chosen (sign-up, change, reset),
// never at sign-in
const PASSWORD_NOTE =
  " It applies when you next choose a password; your current password keeps working.";

const passwordRule = (text: string): ConfigurationAnnouncement => ({
  title: "Password rules updated",
  body: `${text}${PASSWORD_NOTE}`,
});

const requirement =
  (what: string) =>
  (value: unknown): ConfigurationAnnouncement | null =>
    typeof value === "boolean"
      ? passwordRule(
          value
            ? `Passwords must now contain ${what}.`
            : `Passwords no longer need ${what}.`,
        )
      : null;

const count =
  (text: (n: number) => string, title: string) =>
  (value: unknown): ConfigurationAnnouncement | null =>
    typeof value === "number" && Number.isInteger(value)
      ? { title, body: text(value) }
      : null;

/**
 * The settings that users notice (EV-115 lot A), with the announcement
 * each value suggests. Saving one of them offers to announce it; the other
 * settings change nothing for users and offer nothing.
 */
const ANNOUNCED_CONFIGURATIONS: ReadonlyMap<
  string,
  (value: unknown) => ConfigurationAnnouncement | null
> = new Map([
  [
    PASSWORD_POLICY_KEYS.minLength,
    (value: unknown) =>
      typeof value === "number" && Number.isInteger(value)
        ? passwordRule(`Passwords must now have at least ${value} characters.`)
        : null,
  ],
  [PASSWORD_POLICY_KEYS.requireUppercase, requirement("an uppercase letter")],
  [PASSWORD_POLICY_KEYS.requireNumbers, requirement("a number")],
  [PASSWORD_POLICY_KEYS.requireSpecial, requirement("a special character")],
  [
    ACCOUNT_LOCKOUT_KEYS.maxAttempts,
    count(
      (n) => `An account is now locked after ${n} failed sign-in attempts.`,
      "Sign-in protection updated",
    ),
  ],
  [
    ACCOUNT_LOCKOUT_KEYS.durationMinutes,
    count(
      (n) => `A locked account now stays locked for ${n} minutes.`,
      "Sign-in protection updated",
    ),
  ],
  [
    TRUSTED_DEVICE_DAYS_KEY,
    // Read at each use: browsers already trusted follow the new delay
    count(
      (n) =>
        n === 0
          ? "The two-factor sign-in code is now asked at every sign-in, on every browser."
          : `A browser you choose to trust can now skip the two-factor sign-in code for ${n} days. Browsers already trusted follow this delay.`,
      "Two-factor sign-in updated",
    ),
  ],
]);

export const isAnnouncedConfiguration = (key: string): boolean =>
  ANNOUNCED_CONFIGURATIONS.has(key);

/** The announcement this value suggests; null for another key or value. */
export const announcementOf = (
  key: string,
  value: unknown,
): ConfigurationAnnouncement | null =>
  ANNOUNCED_CONFIGURATIONS.get(key)?.(value) ?? null;
