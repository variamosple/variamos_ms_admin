import EnvVars from "#src/common/EnvVars.js";
import { NodeEnvs } from "#src/common/misc.js";

/*
 * Browser origins allowed to call the API with the session cookie (EV-75).
 * The CORS headers, the page to go back to after sign-in and the container
 * logs socket share this one list.
 *
 * CORS_ALLOWED_ORIGINS holds exact origins, compared after normalization.
 * Without it, no origin is allowed, and production does not start. The former
 * CORS_ALLOWED_ORIGINS_PATTERNS (regular expressions) is no longer read since
 * 2026-11-17.
 */

/** The origin of an http(s) address; null for anything else, "null" included. */
export const originOf = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

/** The entries of a comma separated variable, without blank ones. */
export const entriesOf = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

/** Scheme, host and an optional port, nothing else: no path, no default port. */
const isPlainOrigin = (entry: string): boolean =>
  originOf(entry) === entry.replace(/\/$/, "").toLowerCase();

/**
 * Whether a browser origin may call the API with the session cookie. The
 * origin "null" (sandboxed frame, data: page) is never allowed.
 */
export const isAllowedOrigin = (origin: string): boolean => {
  const normalized = originOf(origin);
  if (normalized === null) return false;
  return EnvVars.CORS.AllowedOrigins.some(
    (entry) => originOf(entry) === normalized,
  );
};

export interface OriginListCheck {
  /** The server does not start. */
  errors: string[];
  warnings: string[];
}

/**
 * Checks the list at startup. The origins are never written in the messages,
 * only their position.
 */
export const checkOriginList = (
  env: NodeJS.ProcessEnv,
  nodeEnv: string,
): OriginListCheck => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exact = entriesOf(env.CORS_ALLOWED_ORIGINS);
  const invalid = exact
    .map((entry, index) => (isPlainOrigin(entry) ? 0 : index + 1))
    .filter((position) => position > 0);
  if (invalid.length > 0) {
    errors.push(
      `CORS_ALLOWED_ORIGINS: entry ${invalid.join(", ")} is not an origin ` +
        "(scheme://host[:port], without path or default port)",
    );
  }
  if (env.CORS_ALLOWED_ORIGINS_PATTERNS !== undefined) {
    warnings.push(
      "CORS_ALLOWED_ORIGINS_PATTERNS is no longer read: " +
        (exact.length > 0
          ? "remove it"
          : "set the exact origins in CORS_ALLOWED_ORIGINS"),
    );
  }
  if (exact.length === 0) {
    if (nodeEnv === NodeEnvs.Production.valueOf()) {
      errors.push(
        "CORS_ALLOWED_ORIGINS is not set: no interface could call the API",
      );
    } else {
      warnings.push(
        "CORS_ALLOWED_ORIGINS is not set: no browser origin may call the API",
      );
    }
  }
  return { errors, warnings };
};
