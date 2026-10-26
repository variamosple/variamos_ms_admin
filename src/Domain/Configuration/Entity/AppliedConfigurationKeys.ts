import { TRUSTED_DEVICE_DAYS_KEY } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { HEALTH_CHECK_INTERVAL_KEY } from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import { PASSWORD_HASHING_COST_KEY } from "#src/Domain/User/Entity/PasswordHashingCost.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import {
  PASSWORD_POLICY_KEYS,
  PASSWORD_RESET_EXPIRY_KEY,
} from "#src/Domain/User/Service/PasswordPolicyService.js";

/**
 * Keys that some code reads (EV-87 lot 1). The other keys are saved but have
 * no effect yet; the configuration screen says so, so that an administrator
 * does not believe a protection is on when it is not (T-20).
 */
export const APPLIED_CONFIGURATION_KEYS: ReadonlySet<string> = new Set([
  HEALTH_CHECK_INTERVAL_KEY,
  ...Object.values(PASSWORD_POLICY_KEYS),
  PASSWORD_RESET_EXPIRY_KEY,
  ...Object.values(ACCOUNT_LOCKOUT_KEYS),
  TRUSTED_DEVICE_DAYS_KEY,
  PASSWORD_HASHING_COST_KEY,
]);

export const isConfigurationApplied = (key: string): boolean =>
  APPLIED_CONFIGURATION_KEYS.has(key);
