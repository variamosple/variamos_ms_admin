import { refusalOfConfigurationValue } from "#src/Domain/Configuration/Entity/AppliedConfigurationKeys.js";
import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { isSecretMask } from "#src/Domain/Core/Secret/SecretMask.js";

export type ConfigurationValueType =
  | "boolean"
  | "string"
  | "number"
  | "array"
  | "object";

export interface ExistingConfiguration {
  isReadOnly: boolean;
  requiresMfa: boolean;
  isSecret: boolean;
  type: ConfigurationValueType;
}

export interface ConfigurationUpdateRefusal {
  errorCode: DomainErrorCodes;
  message: string;
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the text typed on the micro-service page as a value of the key's
 * type, as the configuration API stores it (EV-70). A string is kept as
 * typed, so "8080" stays a string for a string key. Returns undefined when
 * the text is not a value of that type.
 */
export function readConfigurationValue(
  raw: string,
  type: ConfigurationValueType,
): ConfigurationValue | undefined {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) ? value : undefined;
    }
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    case "array": {
      const value = parseJson(raw);
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? (value as string[])
        : undefined;
    }
    case "object": {
      const value = parseJson(raw);
      return isRecord(value) ? value : undefined;
    }
  }
}

/**
 * Rules applied when a configuration is updated from the micro-service page.
 * They match those of the configuration API (read-only, MFA, secret mask,
 * value type, value the code would not use); that page has no MFA step, so
 * MFA-protected keys are refused there. Returns null when the update is
 * allowed.
 */
export function refuseConfigurationUpdate(
  key: string,
  value: string,
  existing: ExistingConfiguration | null,
): ConfigurationUpdateRefusal | null {
  if (!existing) return outOfRange(key, parseJson(value) ?? value);
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
  const typed = readConfigurationValue(value, existing.type);
  if (typed === undefined) {
    return {
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: `Value for key '${key}' must be ${VALUE_TYPE_NAMES[existing.type]}.`,
    };
  }
  return outOfRange(key, typed);
}

/** The refusal of a value the code reading the key would not use (EV-18). */
const outOfRange = (
  key: string,
  value: unknown,
): ConfigurationUpdateRefusal | null => {
  const message = refusalOfConfigurationValue(key, value);
  return message
    ? { errorCode: DomainErrorCodes.INVALID_INPUT, message }
    : null;
};

const VALUE_TYPE_NAMES: Record<ConfigurationValueType, string> = {
  boolean: "true or false",
  string: "a string",
  number: "a number",
  array: "a JSON array of strings",
  object: "a JSON object",
};
