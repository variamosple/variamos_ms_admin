import { NodeEnvs } from "#src/common/misc.js";
import { isReadableGitHubPrivateKey } from "#src/Infrastructure/GitHub/githubPrivateKey.js";
import { parseEncryptionKey } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";

/*
 * The secrets checked before the server starts (EV-45, EV-69). In
 * production, a problem stops the server; elsewhere it is a warning. A
 * message names the variable and the rule, never the value nor its length.
 */

/**
 * Variables without which the service would run on an empty or known secret,
 * on test credentials, or without sending its mails: in production, the
 * server refuses to start without them. The public key is derived from the
 * private one when its path is not set, and no cookie is signed: neither
 * VARIAMOS_PUBLIC_KEY_PATH nor COOKIE_SECRET is required.
 */
export const REQUIRED_IN_PRODUCTION = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_DATABASE",
  "NOTIFICATION_INTERNAL_TOKEN",
  "VARIAMOS_PRIVATE_KEY_PATH",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const;

/**
 * Issues are written only to the repositories of GITHUB_MANAGED_REPOS: with
 * at least one, production needs the GitHub App. GITHUB_TOKEN stays an
 * optional fallback for the day the App fails.
 */
export const GITHUB_APP = ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY"] as const;

interface SecretGroup {
  readonly names: readonly string[];
  /** What the service does without them, warned outside production. */
  readonly withoutThem?: string;
}

/**
 * Variables that work only together: both or neither. A later pair, such as
 * the account the migrations use, is one more line here.
 */
export const SET_TOGETHER: readonly SecretGroup[] = [
  {
    names: GITHUB_APP,
    withoutThem: "issues reach GitHub only through GITHUB_TOKEN, if it is set",
  },
  {
    names: ["SMTP_USER", "SMTP_PASSWORD"],
    withoutThem: "mails are only logged, not sent",
  },
];

interface SecretFormat {
  readonly name: string;
  readonly isValid: (value: string) => boolean;
  readonly rule: string;
}

/** The format of a secret, checked when it is set. */
const FORMATS: readonly SecretFormat[] = [
  {
    name: "CONFIG_ENCRYPTION_KEY",
    isValid: (value) => parseEncryptionKey(value) !== null,
    rule: "is not 32 bytes in base64: secret configurations cannot be changed",
  },
  {
    name: "MFA_ENCRYPTION_KEY",
    isValid: (value) => parseEncryptionKey(value) !== null,
    rule: "is not 32 bytes in base64: two-factor enrollment is unavailable",
  },
  {
    name: "GITHUB_PRIVATE_KEY",
    isValid: isReadableGitHubPrivateKey,
    rule: "is not a readable private key: the GitHub App cannot sign in",
  },
];

/**
 * Refused in production once the token is renewed (renewal procedure of the
 * module secrets); until then, a warning.
 */
export const INTERNAL_TOKEN_MIN_LENGTH = 32;

export interface SecretCheck {
  errors: string[];
  warnings: string[];
}

const managedRepositories = (env: NodeJS.ProcessEnv): boolean =>
  (env.GITHUB_MANAGED_REPOS ?? "")
    .split(",")
    .some((repository) => repository.trim() !== "");

const isSet = (env: NodeJS.ProcessEnv, name: string): boolean =>
  Boolean(env[name]?.trim());

/** The required variables that are missing or blank, in production. */
function missingInProduction(env: NodeJS.ProcessEnv): string[] {
  const required: string[] = [...REQUIRED_IN_PRODUCTION];
  if (managedRepositories(env)) required.push(...GITHUB_APP);
  return required.filter((name) => !isSet(env, name));
}

/**
 * A pair set by half; outside production, a pair not set at all. A name
 * already reported as missing is not reported again.
 */
function groupProblem(
  env: NodeJS.ProcessEnv,
  group: SecretGroup,
  production: boolean,
  missing: readonly string[],
): { problem?: string; warning?: string } {
  const absent = group.names.filter((name) => !isSet(env, name));
  if (absent.length === group.names.length) {
    return !production && group.withoutThem
      ? {
          warning: `${group.names.join(" and ")} not set: ${group.withoutThem}`,
        }
      : {};
  }
  if (absent.length === 0 || absent.every((name) => missing.includes(name))) {
    return {};
  }
  const present = group.names.filter((name) => isSet(env, name));
  return {
    problem: `${absent.join(", ")} not set while ${present.join(", ")} is: set ${group.names.join(" and ")} together`,
  };
}

/** The secrets that are set but malformed. */
const malformedSecrets = (env: NodeJS.ProcessEnv): string[] =>
  FORMATS.filter((format) => {
    const value = env[format.name]?.trim();
    return value && !format.isValid(value);
  }).map((format) => `${format.name} ${format.rule}`);

/** The problems of the secrets, as errors in production, warnings elsewhere. */
export function checkSecrets(
  env: NodeJS.ProcessEnv,
  nodeEnv: string,
): SecretCheck {
  const production = nodeEnv === NodeEnvs.Production.valueOf();
  const errors: string[] = [];
  const warnings: string[] = [];
  const problems = production ? errors : warnings;

  const missing = production ? missingInProduction(env) : [];
  if (missing.length > 0) {
    errors.push(`Missing in production: ${missing.join(", ")}`);
  }
  for (const group of SET_TOGETHER) {
    const { problem, warning } = groupProblem(env, group, production, missing);
    if (problem) problems.push(problem);
    if (warning) warnings.push(warning);
  }
  problems.push(...malformedSecrets(env));

  const token = env.NOTIFICATION_INTERNAL_TOKEN?.trim();
  if (production && token && token.length < INTERNAL_TOKEN_MIN_LENGTH) {
    warnings.push(
      `NOTIFICATION_INTERNAL_TOKEN is shorter than ${INTERNAL_TOKEN_MIN_LENGTH.toString()} characters: it will be refused once renewed`,
    );
  }

  return { errors, warnings };
}
