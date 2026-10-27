const MINUTE_MS = 60 * 1000;

/** Accepted bounds of the configured values; outside them, the default. */
const ACCOUNT_LOCKOUT_BOUNDS = {
  maxAttempts: { min: 3, max: 100 },
  durationMinutes: { min: 1, max: 1440 },
} as const;

/**
 * Sign-in lockout (EV-87 lot 4): after `maxAttempts` failed sign-ins in a
 * row, the account is refused for `durationMinutes`. The values come from
 * the security.lockout.* keys.
 */
export class AccountLockoutPolicy {
  /** Same limit as before the keys existed: 10 failures, 15 minutes. */
  public static readonly DEFAULT = new AccountLockoutPolicy(10, 15);

  private constructor(
    public readonly maxAttempts: number,
    public readonly durationMinutes: number,
  ) {}

  public get durationMs(): number {
    return this.durationMinutes * MINUTE_MS;
  }

  /** An invalid or out-of-bounds value takes the default. */
  public static fromConfiguration(values: {
    maxAttempts?: unknown;
    durationMinutes?: unknown;
  }): AccountLockoutPolicy {
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
    const defaults = AccountLockoutPolicy.DEFAULT;
    return new AccountLockoutPolicy(
      bounded(
        values.maxAttempts,
        ACCOUNT_LOCKOUT_BOUNDS.maxAttempts,
        defaults.maxAttempts,
      ),
      bounded(
        values.durationMinutes,
        ACCOUNT_LOCKOUT_BOUNDS.durationMinutes,
        defaults.durationMinutes,
      ),
    );
  }
}
