import { addConfigurationKeys } from "./configurationKeys.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

// Values as of 2026-11-14: no address, so the alerts stay off until an
// administrator sets one. Written here rather than read from the code: a
// migration never changes once applied.
export const SERVICE_ALERT_ROWS = [
  {
    key: "monitoring.alerts.recipients",
    value: "",
    type: "string",
    category: "monitoring",
    description:
      "Addresses that receive a mail when a service stops answering its health checks, then when it answers again, separated by commas (up to 10). Empty turns the alerts off.",
  },
  {
    key: "monitoring.alerts.failures_before_alert",
    value: 3,
    type: "number",
    category: "monitoring",
    description:
      "Failed health checks in a row before a service is reported down (2 to 20).",
  },
];

/** The keys of the service alerts, under the monitoring tab. */
export const serviceAlertKeys: SchemaMigration = {
  name: "0024-service-alert-keys",
  up: ({ context }: { context: MigrationContext }) =>
    addConfigurationKeys(
      context,
      "0024-service-alert-keys",
      SERVICE_ALERT_ROWS,
    ),
  // Reverting would drop the addresses an administrator may have set
  down: refuseRollback("service alert keys"),
};
