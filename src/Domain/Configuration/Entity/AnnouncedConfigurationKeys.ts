import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import { PASSWORD_POLICY_KEYS } from "#src/Domain/User/Service/PasswordPolicyService.js";

/** An announcement the interface offers to send, in English like it. */
export interface ConfigurationAnnouncement {
  title: string;
  body: string;
  // Said once when several settings are announced together
  note?: string;
}

// The policy is checked when a password is chosen (sign-up, change, reset),
// never at sign-in
const PASSWORD_NOTE =
  "The rules apply when you next choose a password; your current password keeps working.";

const PASSWORDS = { title: "Password rules updated", topic: "password rules" };
const SIGN_IN = {
  title: "Sign-in protection updated",
  topic: "sign-in protection",
};
const TWO_FACTOR = {
  title: "Two-factor sign-in updated",
  topic: "two-factor sign-in",
};

/**
 * What a value changes for users, said two ways: applied now ("Passwords
 * must now have…") and from a later date ("passwords must have…", after
 * "From 15 November 2026 at 13:00 UTC, ") (EV-115 lot B).
 */
interface Rule {
  now: string;
  later: string;
}

interface AnnouncedSetting {
  title: string;
  topic: string;
  rule: (value: unknown) => Rule | null;
  note?: string;
}

const whole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const requirement =
  (what: string) =>
  (value: unknown): Rule | null => {
    if (typeof value !== "boolean") return null;
    return value
      ? {
          now: `Passwords must now contain ${what}.`,
          later: `passwords must contain ${what}`,
        }
      : {
          now: `Passwords no longer need ${what}.`,
          later: `passwords no longer need ${what}`,
        };
  };

const passwordRequirement = (what: string): AnnouncedSetting => ({
  ...PASSWORDS,
  rule: requirement(what),
  note: PASSWORD_NOTE,
});

/**
 * The settings that users notice (EV-115 lot A), with the announcement
 * each value suggests. Saving one of them offers to announce it; the other
 * settings change nothing for users and offer nothing.
 */
const ANNOUNCED_CONFIGURATIONS: ReadonlyMap<string, AnnouncedSetting> = new Map(
  [
    [
      PASSWORD_POLICY_KEYS.minLength,
      {
        ...PASSWORDS,
        rule: (value: unknown) =>
          whole(value)
            ? {
                now: `Passwords must now have at least ${value} characters.`,
                later: `passwords must have at least ${value} characters`,
              }
            : null,
        note: PASSWORD_NOTE,
      },
    ],
    [
      PASSWORD_POLICY_KEYS.requireUppercase,
      passwordRequirement("an uppercase letter"),
    ],
    [PASSWORD_POLICY_KEYS.requireNumbers, passwordRequirement("a number")],
    [
      PASSWORD_POLICY_KEYS.requireSpecial,
      passwordRequirement("a special character"),
    ],
    [
      ACCOUNT_LOCKOUT_KEYS.maxAttempts,
      {
        ...SIGN_IN,
        rule: (value: unknown) =>
          whole(value)
            ? {
                now: `An account is now locked after ${value} failed sign-in attempts.`,
                later: `an account is locked after ${value} failed sign-in attempts`,
              }
            : null,
      },
    ],
    [
      ACCOUNT_LOCKOUT_KEYS.durationMinutes,
      {
        ...SIGN_IN,
        rule: (value: unknown) =>
          whole(value)
            ? {
                now: `A locked account now stays locked for ${value} minutes.`,
                later: `a locked account stays locked for ${value} minutes`,
              }
            : null,
      },
    ],
    [
      TRUSTED_DEVICE_DAYS_KEY,
      {
        ...TWO_FACTOR,
        rule: (value: unknown) => {
          if (!whole(value)) return null;
          return value === 0
            ? {
                now: "The two-factor sign-in code is now asked at every sign-in, on every browser.",
                later:
                  "the two-factor sign-in code is asked at every sign-in, on every browser",
              }
            : {
                now: `A browser you choose to trust can now skip the two-factor sign-in code for ${value} days.`,
                later: `a browser you choose to trust can skip the two-factor sign-in code for ${value} days`,
              };
        },
        // Read at each use: browsers already trusted follow the new delay
        note: "Browsers already trusted follow the new delay.",
      },
    ],
  ],
);

export const isAnnouncedConfiguration = (key: string): boolean =>
  ANNOUNCED_CONFIGURATIONS.has(key);

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** An instant as announcements say it: "15 November 2026 at 13:00 UTC". */
export const announcedInstant = (at: Date): string =>
  `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()} at ${twoDigits(at.getUTCHours())}:${twoDigits(at.getUTCMinutes())} UTC`;

/**
 * The announcement this value suggests, applied now or from `from` (EV-115
 * lot B); null for another key or value.
 */
export const announcementOf = (
  key: string,
  value: unknown,
  from?: Date,
): ConfigurationAnnouncement | null => {
  const setting = ANNOUNCED_CONFIGURATIONS.get(key);
  const rule = setting?.rule(value);
  if (!setting || !rule) return null;
  const note = setting.note;
  return {
    title: setting.title,
    body: from ? `From ${announcedInstant(from)}, ${rule.later}.` : rule.now,
    ...(note ? { note } : {}),
  };
};

/** What to tell users when a planned change they were told of is cancelled. */
export const cancellationOf = (
  key: string,
  from: Date,
): ConfigurationAnnouncement | null => {
  const setting = ANNOUNCED_CONFIGURATIONS.get(key);
  return setting
    ? {
        title: "Planned change cancelled",
        body: `The change to the ${setting.topic} announced for ${announcedInstant(from)} will not happen.`,
      }
    : null;
};
