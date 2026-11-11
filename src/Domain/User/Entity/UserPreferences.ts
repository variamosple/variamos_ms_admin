/**
 * What an account chose for its display (EV-115 lot C). The system keeps
 * every instant in UTC; the time zone only changes how one is shown.
 */
export interface UserPreferences {
  /** An IANA time zone ("America/Bogota"), or none: the browser's then. */
  timeZone: string | null;
  updatedAt: Date | null;
}

export const NO_PREFERENCES: UserPreferences = {
  timeZone: null,
  updatedAt: null,
};

export const TIME_ZONE_MAX = 64;

/**
 * The time zone as the runtime names it ("europe/paris" gives
 * "Europe/Paris"), or null if the runtime does not know it. Intl is the
 * reference: the browser converts with the same data.
 */
export const knownTimeZone = (zone: string): string | null => {
  if (!zone || zone.length > TIME_ZONE_MAX) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};
