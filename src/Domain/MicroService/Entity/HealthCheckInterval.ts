/** Seconds between two health checks, set on the configuration screen. */
export const HEALTH_CHECK_INTERVAL_KEY =
  "monitoring.health_check_interval_seconds";

/** The interval in ms for a positive number of seconds; null otherwise. */
export function healthCheckIntervalMsOf(value: unknown): number | null {
  const seconds = Number(value);
  return !Number.isNaN(seconds) && seconds > 0 ? seconds * 1000 : null;
}
