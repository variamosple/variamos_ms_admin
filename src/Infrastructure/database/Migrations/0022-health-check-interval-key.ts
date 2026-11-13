import { addConfigurationKeys } from "./configurationKeys.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

// Value as of 2026-11-13: the collector's default, 30 s (one check of every
// service each 30 s). Written here rather than read from the code: a
// migration never changes once applied.
export const HEALTH_CHECK_INTERVAL_ROWS = [
  {
    key: "monitoring.health_check_interval_seconds",
    value: 30,
    type: "number",
    description:
      "Seconds between two health checks of the services (5 to 86400). A change applies at once.",
  },
];

/**
 * Lets the configuration screen offer the interval without a manual insert:
 * until now, the key existed only if someone had added it by SQL.
 */
export const healthCheckIntervalKey: SchemaMigration = {
  name: "0022-health-check-interval-key",
  up: ({ context }: { context: MigrationContext }) =>
    addConfigurationKeys(
      context,
      "0022-health-check-interval-key",
      HEALTH_CHECK_INTERVAL_ROWS,
    ),
  // Reverting would drop the value an administrator may have set
  down: refuseRollback("health check interval key"),
};
