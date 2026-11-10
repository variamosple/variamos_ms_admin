import fc from "fast-check";
import {
  SECURITY_ALERT_KEYS,
  SecurityAlertPolicy,
} from "#src/Domain/Activity/SecurityAlertPolicy.js";
import {
  BUG_SCHEDULE_BOUNDS,
  BUG_SYNC_INTERVAL_KEY,
  bugSyncIntervalMsOf,
  REJECTED_BUG_RETENTION_KEY,
  rejectedBugRetentionDaysOf,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import {
  HEALTH_CHECK_INTERVAL_KEY,
  healthCheckIntervalMsOf,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import {
  DEFAULT_PASSWORD_HASHING_COST,
  PASSWORD_HASHING_COST_KEY,
  passwordHashingCostOf,
} from "#src/Domain/User/Entity/PasswordHashingCost.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import {
  PASSWORD_POLICY_KEYS,
  PASSWORD_RESET_EXPIRY_KEY,
} from "#src/Domain/User/Service/PasswordPolicyService.js";
import {
  acceptedValuesOf,
  refusalOfConfigurationValue,
} from "./AppliedConfigurationKeys.js";

// Properties checked on generated values (EV-22): what the screen is told,
// what the save accepts and what the code uses say the same thing

const NUMBER_KEYS = [
  HEALTH_CHECK_INTERVAL_KEY,
  PASSWORD_POLICY_KEYS.minLength,
  PASSWORD_RESET_EXPIRY_KEY,
  ACCOUNT_LOCKOUT_KEYS.maxAttempts,
  ACCOUNT_LOCKOUT_KEYS.durationMinutes,
  TRUSTED_DEVICE_DAYS_KEY,
  PASSWORD_HASHING_COST_KEY,
  SECURITY_ALERT_KEYS.failedSignInsMax,
  SECURITY_ALERT_KEYS.failedSignInsWindowMinutes,
  SECURITY_ALERT_KEYS.massOperationsMax,
  SECURITY_ALERT_KEYS.massOperationsWindowMinutes,
  SECURITY_ALERT_KEYS.cooldownMinutes,
  BUG_SYNC_INTERVAL_KEY,
  REJECTED_BUG_RETENTION_KEY,
];

/** Any value a configuration may hold, with numbers close to the bounds. */
const valueAround = (key: string) => {
  const { min = 0, max = 0 } = acceptedValuesOf(key) ?? {};
  return fc.oneof(
    fc.constantFrom(min - 1, min, max, max + 1),
    fc.integer({ min: min - 3, max: max + 3 }),
    fc.integer(),
    fc.double(),
    fc.integer({ min, max }).map(String),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
  );
};

const isWholeNumberWithin = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

describe("applied configuration properties", () => {
  it.each(NUMBER_KEYS)(
    "%s accepts exactly the whole numbers within the bounds the screen gets",
    (key) => {
      const accepted = acceptedValuesOf(key);
      expect(accepted?.min).toBeDefined();
      expect(accepted?.max).toBeDefined();
      const { min, max } = accepted as { min: number; max: number };

      fc.assert(
        fc.property(valueAround(key), (value) => {
          expect(refusalOfConfigurationValue(key, value) === null).toBe(
            isWholeNumberWithin(value, min, max),
          );
        }),
      );
    },
  );

  // A value the save accepts is the one the code uses; a refused one, read
  // from an older save, gives way to the default
  it.each([
    [
      BUG_SYNC_INTERVAL_KEY,
      (value: unknown) => bugSyncIntervalMsOf(value),
      (value: number) => value * 60_000,
      BUG_SCHEDULE_BOUNDS.syncIntervalMinutes.default * 60_000,
    ],
    [
      REJECTED_BUG_RETENTION_KEY,
      (value: unknown) => rejectedBugRetentionDaysOf(value),
      (value: number) => value,
      BUG_SCHEDULE_BOUNDS.rejectedRetentionDays.default,
    ],
    [
      PASSWORD_HASHING_COST_KEY,
      (value: unknown) => passwordHashingCostOf(value, undefined),
      (value: number) => value,
      DEFAULT_PASSWORD_HASHING_COST,
    ],
    [
      SECURITY_ALERT_KEYS.massOperationsMax,
      (value: unknown) =>
        SecurityAlertPolicy.fromConfiguration({ massOperationsMax: value })
          .massOperations.max,
      (value: number) => value,
      SecurityAlertPolicy.DEFAULT.massOperations.max,
    ],
    [
      SECURITY_ALERT_KEYS.cooldownMinutes,
      (value: unknown) =>
        SecurityAlertPolicy.fromConfiguration({ cooldownMinutes: value })
          .cooldownMs,
      (value: number) => value * 60_000,
      SecurityAlertPolicy.DEFAULT.cooldownMs,
    ],
  ] as const)(
    "%s is used as saved, or replaced by its default",
    (key, read, used, fallback) => {
      fc.assert(
        fc.property(valueAround(key), (value) => {
          const accepted = refusalOfConfigurationValue(key, value) === null;

          expect(read(value)).toBe(accepted ? used(value as number) : fallback);
        }),
      );
    },
  );

  it("uses any accepted health check interval as saved", () => {
    fc.assert(
      fc.property(valueAround(HEALTH_CHECK_INTERVAL_KEY), (value) => {
        fc.pre(
          refusalOfConfigurationValue(HEALTH_CHECK_INTERVAL_KEY, value) ===
            null,
        );

        expect(healthCheckIntervalMsOf(value)).toBe((value as number) * 1000);
      }),
    );
  });
});
