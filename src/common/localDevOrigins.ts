import EnvVars from "#src/common/EnvVars.js";

/*
 * Temporary sign-in of an interface run on a developer's computer against
 * production (decided on 2026-11-17, until the development kit is ready).
 *
 * Since 2026-11-14 the session token lives in the httpOnly cookie of
 * app.variamos.com alone (EV-75, EV-117): a page served on localhost can
 * neither read that cookie nor receive it with its requests. For the origins
 * of AUTH_LOCAL_DEV_ORIGINS, and only until the day AUTH_LOCAL_DEV_UNTIL, the
 * admin gives the token as before: in the address the browser goes back to,
 * and in the session-info answer that refreshes it.
 *
 * Only http://localhost:<port> and http://127.0.0.1:<port> may be listed:
 * any other entry stops the server at startup.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The origin of a local http address with an explicit port; null otherwise. */
export const localOriginOf = (entry: string): string | null => {
  try {
    const url = new URL(entry);
    const isBareOrigin =
      url.origin === entry.replace(/\/$/, "").toLowerCase() &&
      url.pathname === "/";
    return url.protocol === "http:" &&
      LOCAL_HOSTS.has(url.hostname) &&
      url.port !== "" &&
      isBareOrigin
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

const entriesOf = (raw: string): string[] =>
  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

/** The last moment of the day AUTH_LOCAL_DEV_UNTIL, in UTC; null if invalid. */
export const localDevEndOf = (until: string): number | null => {
  if (!DAY.test(until)) return null;
  const end = Date.parse(`${until}T23:59:59.999Z`);
  return Number.isNaN(end) ? null : end;
};

/** Whether this origin may receive the session token, now. */
export const isLocalDevOrigin = (
  origin: string,
  now: number = Date.now(),
): boolean => {
  const end = localDevEndOf(EnvVars.LocalDev.Until);
  if (end === null || now > end) return false;
  const normalized = localOriginOf(origin);
  if (normalized === null) return false;
  return entriesOf(EnvVars.LocalDev.Origins).some(
    (entry) => localOriginOf(entry) === normalized,
  );
};

export interface LocalDevCheck {
  /** The server does not start. */
  errors: string[];
  warnings: string[];
}

/** Checks the two variables at startup; values are never written out. */
export const checkLocalDevOrigins = (
  env: NodeJS.ProcessEnv,
  now: number = Date.now(),
): LocalDevCheck => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = entriesOf(env.AUTH_LOCAL_DEV_ORIGINS ?? "");
  if (entries.length === 0) return { errors, warnings };

  const invalid = entries
    .map((entry, index) => (localOriginOf(entry) === null ? index + 1 : 0))
    .filter((position) => position > 0);
  if (invalid.length > 0) {
    errors.push(
      `AUTH_LOCAL_DEV_ORIGINS: entry ${invalid.join(", ")} is not ` +
        "http://localhost:<port> or http://127.0.0.1:<port>",
    );
  }
  const until = env.AUTH_LOCAL_DEV_UNTIL ?? "";
  const end = localDevEndOf(until);
  if (end === null) {
    errors.push(
      "AUTH_LOCAL_DEV_UNTIL must be a day (YYYY-MM-DD) when " +
        "AUTH_LOCAL_DEV_ORIGINS is set",
    );
  } else if (now > end) {
    warnings.push(
      `AUTH_LOCAL_DEV_ORIGINS has ended on ${until}: remove both variables`,
    );
  } else {
    warnings.push(
      `Local interfaces receive the session token until ${until} ` +
        `(${entries.length} origins)`,
    );
  }
  return { errors, warnings };
};
