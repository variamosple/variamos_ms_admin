const MINUTE_MS = 60 * 1000;

export const SECURITY_ALERT_KEYS = {
  failedSignInsMax: "security.alerts.failed_sign_ins.max_attempts",
  failedSignInsWindowMinutes: "security.alerts.failed_sign_ins.window_minutes",
  massOperationsMax: "security.alerts.mass_operations.max_operations",
  massOperationsWindowMinutes: "security.alerts.mass_operations.window_minutes",
  cooldownMinutes: "security.alerts.cooldown_minutes",
  newDeviceScope: "security.alerts.new_device.scope",
} as const;

/**
 * Whose sign-in from a new device and a new address mails the account
 * itself: nobody, the administrators (default), or every account. Devices
 * are remembered for every account whatever the scope.
 */
export const NEW_DEVICE_SCOPES = ["off", "administrators", "everyone"] as const;
export type NewDeviceScope = (typeof NEW_DEVICE_SCOPES)[number];

const SCOPES: ReadonlySet<unknown> = new Set(NEW_DEVICE_SCOPES);

export const isNewDeviceScope = (value: unknown): value is NewDeviceScope =>
  SCOPES.has(value);

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

/**
 * Security alerts (EV-88 lot D, T-24): repeated failed sign-ins on an
 * account or an address, many administration operations by one account,
 * and a sign-in from a new device and a new address (mailed to the account
 * itself). An alert on the same rule and target is sent once per cooldown.
 * The values come from the security.alerts.* keys. The off-hours rule was
 * removed on 2026-11-17: a fixed span raised alerts on ordinary sign-ins.
 */
export class SecurityAlertPolicy {
  public static readonly DEFAULT = new SecurityAlertPolicy(
    { max: 10, windowMs: 15 * MINUTE_MS },
    { max: 20, windowMs: 10 * MINUTE_MS },
    60 * MINUTE_MS,
    "administrators",
  );

  private constructor(
    public readonly failedSignIns: Threshold,
    public readonly massOperations: Threshold,
    public readonly cooldownMs: number,
    public readonly newDeviceScope: NewDeviceScope,
  ) {}

  /** An invalid or out-of-bounds value takes the default. */
  public static fromConfiguration(values: {
    failedSignInsMax?: unknown;
    failedSignInsWindowMinutes?: unknown;
    massOperationsMax?: unknown;
    massOperationsWindowMinutes?: unknown;
    cooldownMinutes?: unknown;
    newDeviceScope?: unknown;
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
      isNewDeviceScope(values.newDeviceScope)
        ? values.newDeviceScope
        : defaults.newDeviceScope,
    );
  }
}
