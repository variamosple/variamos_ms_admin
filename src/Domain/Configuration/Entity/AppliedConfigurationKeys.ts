import {
  isAcceptedOffHours,
  isKnownTimeZone,
  SECURITY_ALERT_BOUNDS,
  SECURITY_ALERT_KEYS,
} from "#src/Domain/Activity/SecurityAlertPolicy.js";
import {
  BUG_SCHEDULE_BOUNDS,
  BUG_SYNC_INTERVAL_KEY,
  REJECTED_BUG_RETENTION_KEY,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import {
  TRUSTED_DEVICE_DAYS_BOUNDS,
  TRUSTED_DEVICE_DAYS_KEY,
} from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import {
  HEALTH_CHECK_INTERVAL_BOUNDS,
  HEALTH_CHECK_INTERVAL_KEY,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import { ACCOUNT_LOCKOUT_BOUNDS } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";
import {
  PASSWORD_HASHING_COST_BOUNDS,
  PASSWORD_HASHING_COST_KEY,
} from "#src/Domain/User/Entity/PasswordHashingCost.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH_FLOOR,
} from "#src/Domain/User/Entity/PasswordPolicy.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import {
  MAX_PASSWORD_RESET_EXPIRY_MS,
  PASSWORD_POLICY_KEYS,
  PASSWORD_RESET_EXPIRY_KEY,
} from "#src/Domain/User/Service/PasswordPolicyService.js";

/**
 * What a key accepts, sent to the configuration screen so that its form
 * matches (EV-18 lot C): a sentence, the bounds of a number, or the format
 * of a text the form can help with.
 */
export interface AcceptedConfigurationValues {
  text: string;
  min?: number;
  max?: number;
  unit?: string;
  format?: "timeZone" | "timeSpan";
}

interface ConfigurationRule {
  accepts: (value: unknown) => boolean;
  accepted: AcceptedConfigurationValues;
}

const wholeNumber = (
  { min, max }: { min: number; max: number },
  unit: string,
): ConfigurationRule => ({
  accepts: (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max,
  accepted: {
    text: `a whole number of ${unit} from ${min} to ${max}`,
    min,
    max,
    unit,
  },
});

const flag: ConfigurationRule = {
  accepts: (value) => typeof value === "boolean",
  accepted: { text: "true or false" },
};

/**
 * Keys that some code reads (EV-87 lot 1), with the values that code uses.
 * The other keys are saved but have no effect yet; the configuration screen
 * says so, so that an administrator does not believe a protection is on
 * when it is not (T-20). A value the code would replace by its default is
 * refused at the save, rather than ignored without a word (EV-18).
 */
const APPLIED_CONFIGURATION_RULES: ReadonlyMap<string, ConfigurationRule> =
  new Map([
    [
      HEALTH_CHECK_INTERVAL_KEY,
      wholeNumber(HEALTH_CHECK_INTERVAL_BOUNDS, "seconds"),
    ],
    [
      PASSWORD_POLICY_KEYS.minLength,
      wholeNumber(
        { min: PASSWORD_MIN_LENGTH_FLOOR, max: PASSWORD_MAX_LENGTH },
        "characters",
      ),
    ],
    [PASSWORD_POLICY_KEYS.requireUppercase, flag],
    [PASSWORD_POLICY_KEYS.requireNumbers, flag],
    [PASSWORD_POLICY_KEYS.requireSpecial, flag],
    [
      PASSWORD_RESET_EXPIRY_KEY,
      wholeNumber(
        { min: 1, max: MAX_PASSWORD_RESET_EXPIRY_MS },
        "milliseconds",
      ),
    ],
    [
      ACCOUNT_LOCKOUT_KEYS.maxAttempts,
      wholeNumber(ACCOUNT_LOCKOUT_BOUNDS.maxAttempts, "attempts"),
    ],
    [
      ACCOUNT_LOCKOUT_KEYS.durationMinutes,
      wholeNumber(ACCOUNT_LOCKOUT_BOUNDS.durationMinutes, "minutes"),
    ],
    [TRUSTED_DEVICE_DAYS_KEY, wholeNumber(TRUSTED_DEVICE_DAYS_BOUNDS, "days")],
    [
      PASSWORD_HASHING_COST_KEY,
      wholeNumber(PASSWORD_HASHING_COST_BOUNDS, "rounds"),
    ],
    [
      SECURITY_ALERT_KEYS.failedSignInsMax,
      wholeNumber(SECURITY_ALERT_BOUNDS.failedSignInsMax, "failures"),
    ],
    [
      SECURITY_ALERT_KEYS.failedSignInsWindowMinutes,
      wholeNumber(SECURITY_ALERT_BOUNDS.windowMinutes, "minutes"),
    ],
    [
      SECURITY_ALERT_KEYS.massOperationsMax,
      wholeNumber(SECURITY_ALERT_BOUNDS.massOperationsMax, "operations"),
    ],
    [
      SECURITY_ALERT_KEYS.massOperationsWindowMinutes,
      wholeNumber(SECURITY_ALERT_BOUNDS.windowMinutes, "minutes"),
    ],
    [
      SECURITY_ALERT_KEYS.cooldownMinutes,
      wholeNumber(SECURITY_ALERT_BOUNDS.windowMinutes, "minutes"),
    ],
    [
      SECURITY_ALERT_KEYS.offHours,
      {
        accepts: isAcceptedOffHours,
        accepted: {
          text: 'a span such as "20:00-07:00", or nothing to turn it off',
          format: "timeSpan",
        },
      },
    ],
    [
      SECURITY_ALERT_KEYS.timeZone,
      {
        accepts: isKnownTimeZone,
        accepted: {
          text: 'a time zone name such as "America/Bogota"',
          format: "timeZone",
        },
      },
    ],
    [
      BUG_SYNC_INTERVAL_KEY,
      wholeNumber(BUG_SCHEDULE_BOUNDS.syncIntervalMinutes, "minutes"),
    ],
    [
      REJECTED_BUG_RETENTION_KEY,
      wholeNumber(BUG_SCHEDULE_BOUNDS.rejectedRetentionDays, "days"),
    ],
  ]);

export const isConfigurationApplied = (key: string): boolean =>
  APPLIED_CONFIGURATION_RULES.has(key);

/**
 * Why the code would not use this value of the key, or null when it would;
 * a key that no code reads accepts any value of its type.
 */
export const refusalOfConfigurationValue = (
  key: string,
  value: unknown,
): string | null => {
  const rule = APPLIED_CONFIGURATION_RULES.get(key);
  return !rule || rule.accepts(value)
    ? null
    : `Configuration '${key}' expects ${rule.accepted.text}.`;
};

/** What a key the code reads accepts; undefined for any other key. */
export const acceptedValuesOf = (
  key: string,
): AcceptedConfigurationValues | undefined =>
  APPLIED_CONFIGURATION_RULES.get(key)?.accepted;
