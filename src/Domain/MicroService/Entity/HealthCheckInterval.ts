/** Seconds between two health checks, set on the configuration screen. */
export const HEALTH_CHECK_INTERVAL_KEY =
  "monitoring.health_check_interval_seconds";

/** Accepted on the screen: under 5 s the collector would use 5 s anyway. */
export const HEALTH_CHECK_INTERVAL_BOUNDS = {
  min: 5,
  max: 24 * 60 * 60,
} as const;

/** The interval in ms for a positive number of seconds; null otherwise. */
export function healthCheckIntervalMsOf(value: unknown): number | null {
  const seconds = Number(value);
  return !Number.isNaN(seconds) && seconds > 0 ? seconds * 1000 : null;
}
