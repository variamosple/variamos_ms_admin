import { NodeEnvs } from "#src/common/misc.js";

/**
 * Variables without which the service would run on an empty or known secret,
 * or with test credentials: in production, the server refuses to start
 * without them (EV-69). The public key is derived from the private one when
 * its path is not set, and no cookie is signed: neither
 * VARIAMOS_PUBLIC_KEY_PATH nor COOKIE_SECRET is required.
 */
export const REQUIRED_IN_PRODUCTION = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_DATABASE",
  "NOTIFICATION_INTERNAL_TOKEN",
  "VARIAMOS_PRIVATE_KEY_PATH",
] as const;

/** Names of the required variables that are missing or blank. */
export const missingRequiredSecrets = (
  env: NodeJS.ProcessEnv,
  nodeEnv: string,
): string[] =>
  nodeEnv === NodeEnvs.Production.valueOf()
    ? REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim())
    : [];
