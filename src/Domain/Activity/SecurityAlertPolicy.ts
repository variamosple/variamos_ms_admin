const MINUTE_MS = 60 * 1000;

export const SECURITY_ALERT_KEYS = {
  failedSignInsMax: "security.alerts.failed_sign_ins.max_attempts",
  failedSignInsWindowMinutes: "security.alerts.failed_sign_ins.window_minutes",
  massOperationsMax: "security.alerts.mass_operations.max_operations",
  massOperationsWindowMinutes: "security.alerts.mass_operations.window_minutes",
  cooldownMinutes: "security.alerts.cooldown_minutes",
  offHours: "security.alerts.off_hours",
  timeZone: "security.alerts.timezone",
} as const;

/** Accepted bounds of the configured numbers; outside them, the default. */
export const SECURITY_ALERT_BOUNDS = {
  failedSignInsMax: { min: 3, max: 1000 },
  massOperationsMax: { min: 5, max: 1000 },
  windowMinutes: { min: 1, max: 1440 },
} as const;

interface Threshold {
  max: number;
  windowMs: number;
}

/** A span of the day in minutes; it wraps past midnight when start > end. */
export interface OffHours {
  startMinute: number;
  endMinute: number;
  timeZone: string;
}

const HOURS_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

const parseOffHours = (value: unknown, timeZone: string): OffHours | null => {
  const match = typeof value === "string" ? HOURS_PATTERN.exec(value) : null;
  if (!match) return null;
  const [, sh, sm, eh, em] = match.map(Number);
  const startMinute = sh * 60 + sm;
  const endMinute = eh * 60 + em;
  return startMinute === endMinute
    ? null
    : { startMinute, endMinute, timeZone };
};

export const isKnownTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || value === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** Empty (the rule is off) or a span such as "20:00-07:00". */
export const isAcceptedOffHours = (value: unknown): boolean =>
  value === "" || parseOffHours(value, "UTC") !== null;

/**
 * Security alerts (EV-88 lot D, T-24): repeated failed sign-ins on an
 * account or an address, many administration operations by one account,
 * and sign-ins outside working hours. An alert on the same rule and target
 * is sent once per cooldown. The values come from the security.alerts.*
 * keys; the off-hours rule stays off until a span is set.
 */
export class SecurityAlertPolicy {
  public static readonly DEFAULT = new SecurityAlertPolicy(
    { max: 10, windowMs: 15 * MINUTE_MS },
    { max: 20, windowMs: 10 * MINUTE_MS },
    60 * MINUTE_MS,
    null,
  );

  private constructor(
    public readonly failedSignIns: Threshold,
    public readonly massOperations: Threshold,
    public readonly cooldownMs: number,
    public readonly offHours: OffHours | null,
  ) {}

  /** An invalid or out-of-bounds value takes the default. */
  public static fromConfiguration(values: {
    failedSignInsMax?: unknown;
    failedSignInsWindowMinutes?: unknown;
    massOperationsMax?: unknown;
    massOperationsWindowMinutes?: unknown;
    cooldownMinutes?: unknown;
    offHours?: unknown;
    timeZone?: unknown;
  }): SecurityAlertPolicy {
    const bounded = (
      value: unknown,
      { min, max }: { min: number; max: number },
      fallback: number,
    ) =>
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= min &&
      value <= max
        ? value
        : fallback;
    const defaults = SecurityAlertPolicy.DEFAULT;
    const minutes = (value: unknown, fallbackMs: number) =>
      bounded(
        value,
        SECURITY_ALERT_BOUNDS.windowMinutes,
        fallbackMs / MINUTE_MS,
      ) * MINUTE_MS;
    return new SecurityAlertPolicy(
      {
        max: bounded(
          values.failedSignInsMax,
          SECURITY_ALERT_BOUNDS.failedSignInsMax,
          defaults.failedSignIns.max,
        ),
        windowMs: minutes(
          values.failedSignInsWindowMinutes,
          defaults.failedSignIns.windowMs,
        ),
      },
      {
        max: bounded(
          values.massOperationsMax,
          SECURITY_ALERT_BOUNDS.massOperationsMax,
          defaults.massOperations.max,
        ),
        windowMs: minutes(
          values.massOperationsWindowMinutes,
          defaults.massOperations.windowMs,
        ),
      },
      minutes(values.cooldownMinutes, defaults.cooldownMs),
      parseOffHours(
        values.offHours,
        isKnownTimeZone(values.timeZone) ? values.timeZone : "UTC",
      ),
    );
  }

  /** Whether the instant falls in the off-hours span of its time zone. */
  public isOffHours(at: Date): boolean {
    if (!this.offHours) return false;
    const { startMinute, endMinute, timeZone } = this.offHours;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const minute = part("hour") * 60 + part("minute");
    return startMinute < endMinute
      ? minute >= startMinute && minute < endMinute
      : minute >= startMinute || minute < endMinute;
  }
}
