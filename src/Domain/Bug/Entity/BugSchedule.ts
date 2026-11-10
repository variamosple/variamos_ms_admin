/** Configuration keys of the bug tracker schedule (EV-18). */
export const BUG_SYNC_INTERVAL_KEY = "bugs.sync_interval_minutes";
export const REJECTED_BUG_RETENTION_KEY = "bugs.rejected_retention_days";

const MINUTE_MS = 60 * 1000;

/**
 * Accepted values and defaults. Under 5 minutes, the synchronizations would
 * spend the GitHub API quota; a rejected bug is kept a year at most.
 */
export const BUG_SCHEDULE_BOUNDS = {
  syncIntervalMinutes: { min: 5, max: 24 * 60, default: 15 },
  rejectedRetentionDays: { min: 1, max: 365, default: 7 },
} as const;

const isIntegerWithin = (
  value: unknown,
  { min, max }: { min: number; max: number },
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

export const isAcceptedBugSyncInterval = (value: unknown): value is number =>
  isIntegerWithin(value, BUG_SCHEDULE_BOUNDS.syncIntervalMinutes);

export const isAcceptedRejectedBugRetention = (
  value: unknown,
): value is number =>
  isIntegerWithin(value, BUG_SCHEDULE_BOUNDS.rejectedRetentionDays);

/** The time between two synchronizations; out of bounds, the default. */
export const bugSyncIntervalMsOf = (configured: unknown): number =>
  (isAcceptedBugSyncInterval(configured)
    ? configured
    : BUG_SCHEDULE_BOUNDS.syncIntervalMinutes.default) * MINUTE_MS;

/** Days a rejected bug is kept before its purge; out of bounds, the default. */
export const rejectedBugRetentionDaysOf = (configured: unknown): number =>
  isAcceptedRejectedBugRetention(configured)
    ? configured
    : BUG_SCHEDULE_BOUNDS.rejectedRetentionDays.default;
