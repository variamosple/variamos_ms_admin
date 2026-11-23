/** Seconds between two health checks, set on the configuration screen. */
export const HEALTH_CHECK_INTERVAL_KEY =
  "monitoring.health_check_interval_seconds";

/**
 * Accepted on the screen and applied at the reading (ADM-N55): under 5 s the
 * checks would flood the services, over 30 s the monitoring would no longer
 * show the state of a service within 30 s (MA-MS-01).
 */
export const HEALTH_CHECK_INTERVAL_BOUNDS = {
  min: 5,
  max: 30,
} as const;

/** The milliseconds brought within the bounds. */
export function boundedHealthCheckIntervalMs(intervalMs: number): number {
  const { min, max } = HEALTH_CHECK_INTERVAL_BOUNDS;
  return Math.min(Math.max(intervalMs, min * 1000), max * 1000);
}

/**
 * The interval in ms for a positive number of seconds, brought within the
 * bounds: a value written in the database outside the screen cannot move the
 * checks out of them. Null for anything else.
 */
export function healthCheckIntervalMsOf(value: unknown): number | null {
  const seconds = Number(value);
  return !Number.isNaN(seconds) && seconds > 0
    ? boundedHealthCheckIntervalMs(seconds * 1000)
    : null;
}
