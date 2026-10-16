import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { isSecretMask } from "#src/Domain/Core/Secret/SecretMask.js";

export interface ExistingConfiguration {
  isReadOnly: boolean;
  requiresMfa: boolean;
  isSecret: boolean;
}

export interface ConfigurationUpdateRefusal {
  errorCode: DomainErrorCodes;
  message: string;
}

/**
 * Rules applied when a configuration is updated from the micro-service page.
 * They match those of the configuration API (read-only, MFA, secret mask);
 * that page has no MFA step, so MFA-protected keys are refused there.
 * Returns null when the update is allowed.
 */
export function refuseConfigurationUpdate(
  key: string,
  value: string,
  existing: ExistingConfiguration | null,
): ConfigurationUpdateRefusal | null {
  if (!existing) return null;
  if (existing.isReadOnly) {
    return {
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: `Configuration '${key}' is read-only and cannot be updated.`,
    };
  }
  if (existing.requiresMfa) {
    return {
      errorCode: DomainErrorCodes.MFA_REQUIRED,
      message: `Updating configuration '${key}' requires MFA validation: use the configuration page.`,
    };
  }
  if (existing.isSecret && isSecretMask(value)) {
    return {
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: `Enter a new value for the secret configuration '${key}'.`,
    };
  }
  return null;
}
