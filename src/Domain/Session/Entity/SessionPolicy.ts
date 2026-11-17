const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Accepted bounds of the configured values; outside them, the default. */
export const SESSION_POLICY_BOUNDS = {
  idleMinutes: { min: 5, max: 1440 },
  maxHours: { min: 1, max: 720 },
} as const;

/** Why a session can no longer be used. */
export type SessionRefusal = "unknown" | "revoked" | "too_old" | "idle";

/** A session as the registry keeps it. */
export interface SessionRecord {
  userId: string;
  startedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

/**
 * How long a session lasts (EV-74 lot 2, EV-87 lot 4): it ends after
 * `idleMinutes` without any request of its pages, and `maxHours` after the
 * sign-in in any case. The values come from the security.session.* keys.
 */
export class SessionPolicy {
  /** Decided on 2026-11-17: usual durations, a little lenient. */
  public static readonly DEFAULT = new SessionPolicy(60, 12);

  private constructor(
    public readonly idleMinutes: number,
    public readonly maxHours: number,
  ) {}

  public get idleMs(): number {
    return this.idleMinutes * MINUTE_MS;
  }

  public get maxMs(): number {
    return this.maxHours * HOUR_MS;
  }

  /** An invalid or out-of-bounds value takes the default. */
  public static fromConfiguration(values: {
    idleMinutes?: unknown;
    maxHours?: unknown;
  }): SessionPolicy {
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
    const defaults = SessionPolicy.DEFAULT;
    return new SessionPolicy(
      bounded(
        values.idleMinutes,
        SESSION_POLICY_BOUNDS.idleMinutes,
        defaults.idleMinutes,
      ),
      bounded(
        values.maxHours,
        SESSION_POLICY_BOUNDS.maxHours,
        defaults.maxHours,
      ),
    );
  }

  /**
   * Why the session cannot be used by `userId` at `now`, or null when it
   * can. A session of another account counts as unknown.
   */
  public refusalOf(
    record: SessionRecord | null,
    userId: string,
    now: number,
  ): SessionRefusal | null {
    if (!record || record.userId !== userId) return "unknown";
    if (record.revokedAt) return "revoked";
    if (now - record.startedAt.getTime() > this.maxMs) return "too_old";
    if (now - record.lastSeenAt.getTime() > this.idleMs) return "idle";
    return null;
  }
}
