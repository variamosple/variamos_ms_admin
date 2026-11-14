import EnvVars from "#src/common/EnvVars.js";
import { NodeEnvs } from "#src/common/misc.js";

/*
 * Browser origins allowed to call the API with the session cookie (EV-75).
 * The CORS headers, the page to go back to after sign-in and the container
 * logs socket share this one list.
 *
 * CORS_ALLOWED_ORIGINS holds exact origins, compared after normalization.
 * Until it is set, the former CORS_ALLOWED_ORIGINS_PATTERNS (regular
 * expressions) is still read as before, so that a deployment never cuts the
 * interfaces off.
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
  const exact = EnvVars.CORS.AllowedOrigins;
  if (exact.length > 0) {
    return exact.some((entry) => originOf(entry) === normalized);
  }
  return EnvVars.CORS.AllowedOriginsPatterns.some((pattern) =>
    pattern.test(origin),
  );
};

export interface OriginListCheck {
  /** The server does not start. */
  errors: string[];
  warnings: string[];
}

/**
 * Checks the two variables at startup. Neither the origins nor the patterns
 * are written in the messages, only their position.
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
  if (exact.length > 0 || nodeEnv !== NodeEnvs.Production.valueOf()) {
    return { errors, warnings };
  }

  const patterns = (env.CORS_ALLOWED_ORIGINS_PATTERNS ?? "").split(",");
  const blank = patterns
    .map((pattern, index) => (pattern.trim() === "" ? index + 1 : 0))
    .filter((position) => position > 0);
  if (blank.length > 0) {
    errors.push(
      "CORS_ALLOWED_ORIGINS is not set and CORS_ALLOWED_ORIGINS_PATTERNS " +
        `has an empty pattern (position ${blank.join(", ")}), which allows every origin`,
    );
  } else {
    warnings.push(
      "CORS_ALLOWED_ORIGINS is not set: the former " +
        "CORS_ALLOWED_ORIGINS_PATTERNS is used; set the exact origins instead",
    );
  }
  return { errors, warnings };
};
