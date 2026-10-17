import logger from "jet-logger";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { PasswordPolicy } from "#src/Domain/User/Entity/PasswordPolicy.js";

export const PASSWORD_POLICY_KEYS = {
  minLength: "security.password.min_length",
  requireUppercase: "security.password.require_uppercase",
  requireNumbers: "security.password.require_numbers",
  requireSpecial: "security.password.require_special",
} as const;
export const PASSWORD_RESET_EXPIRY_KEY = "security.password.reset_expiry";

export interface IPasswordPolicyProvider {
  getPolicy(): Promise<PasswordPolicy>;
  /** The configured reset link validity in ms, or null when not set. */
  getResetExpiryMs(): Promise<number | null>;
}

/** The fixed default, for callers and tests without configuration. */
export const DEFAULT_PASSWORD_POLICY_PROVIDER: IPasswordPolicyProvider = {
  getPolicy: async () => PasswordPolicy.DEFAULT,
  getResetExpiryMs: async () => null,
};

/**
 * Reads the security.password.* keys at each use, so that a change on the
 * configuration screen applies from the next sign-up, change or reset
 * (EV-87 lot 3, MA-CF-02). A key that cannot be read takes the default.
 */
export class PasswordPolicyService implements IPasswordPolicyProvider {
  public constructor(
    private readonly configurationRepository: IConfigurationRepository,
  ) {}

  private async read(key: string): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("readPasswordPolicy", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch (error) {
      logger.warn(`Could not read ${key}: ${(error as Error).message}`);
      return undefined;
    }
  }

  public async getPolicy(): Promise<PasswordPolicy> {
    const [minLength, requireUppercase, requireNumbers, requireSpecial] =
      await Promise.all([
        this.read(PASSWORD_POLICY_KEYS.minLength),
        this.read(PASSWORD_POLICY_KEYS.requireUppercase),
        this.read(PASSWORD_POLICY_KEYS.requireNumbers),
        this.read(PASSWORD_POLICY_KEYS.requireSpecial),
      ]);
    return PasswordPolicy.fromConfiguration({
      minLength,
      requireUppercase,
      requireNumbers,
      requireSpecial,
    });
  }

  public async getResetExpiryMs(): Promise<number | null> {
    const value = await this.read(PASSWORD_RESET_EXPIRY_KEY);
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;
  }
}

/** Checks a new password against the configured policy; logs a refusal. */
export async function checkNewPassword(
  provider: IPasswordPolicyProvider,
  password: string,
  context: string,
): Promise<string | null> {
  const policy = await provider.getPolicy();
  const broken = policy.violations(password);
  if (broken.length === 0) return null;
  logger.info(`[PASSWORD POLICY] ${context} refused: ${broken.join(", ")}`);
  return policy.describe();
}
