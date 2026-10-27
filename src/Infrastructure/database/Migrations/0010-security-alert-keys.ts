import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Values as of 2026-10-26 (EV-88 lot D): a migration never changes once
// applied, so they are written here rather than read from the code
export const SECURITY_ALERT_ROWS = [
  {
    key: "security.alerts.failed_sign_ins.max_attempts",
    value: 10,
    type: "number",
    description:
      "Failed sign-ins on one account or one address that raise a security alert (3 to 1000).",
  },
  {
    key: "security.alerts.failed_sign_ins.window_minutes",
    value: 15,
    type: "number",
    description:
      "Minutes over which failed sign-ins are counted for a security alert (1 to 1440).",
  },
  {
    key: "security.alerts.mass_operations.max_operations",
    value: 20,
    type: "number",
    description:
      "Administration operations by one account that raise a security alert (5 to 1000).",
  },
  {
    key: "security.alerts.mass_operations.window_minutes",
    value: 10,
    type: "number",
    description:
      "Minutes over which administration operations are counted for a security alert (1 to 1440).",
  },
  {
    key: "security.alerts.cooldown_minutes",
    value: 60,
    type: "number",
    description:
      "Minutes before the same alert on the same account or address is sent again (1 to 1440).",
  },
  {
    key: "security.alerts.off_hours",
    value: "",
    type: "string",
    description:
      'Span of the day when a sign-in raises a security alert, as "HH:MM-HH:MM" (for example "20:00-07:00"); empty turns the alert off.',
  },
  {
    key: "security.alerts.timezone",
    value: "UTC",
    type: "string",
    description:
      'Time zone of the off-hours span, as an IANA name (for example "America/Bogota").',
  },
];

export const securityAlertKeys: SchemaMigration = {
  name: "0010-security-alert-keys",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const added: string[] = [];
    await sequelize.transaction(async (transaction) => {
      for (const row of SECURITY_ALERT_ROWS) {
        // A key already there keeps the value an administrator gave it
        const inserted = await sequelize.query<{ key: string }>(
          `INSERT INTO "${schema}"."configurations"
             ("key", "value", "type", "category", "requires_mfa", "is_secret",
              "environment_scope", "is_read_only", "target_services",
              "description", "updated_by", "created_at", "updated_at")
           VALUES (:key, CAST(:value AS jsonb), :type, 'security', false, false,
              'all', false, ARRAY['variamos_ms_admin']::varchar(50)[],
              :description, 'system_migration', now(), now())
           ON CONFLICT ("key") DO NOTHING
           RETURNING "key"`,
          {
            replacements: { ...row, value: JSON.stringify(row.value) },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        added.push(...inserted.map((r) => r.key));
      }
    });
    logger.info(
      `[MIGRATION] 0010-security-alert-keys: ${added.length} key(s) added (${added.join(", ") || "none"}), ${SECURITY_ALERT_ROWS.length - added.length} already present and left untouched`,
    );
  },
  down: async () => {
    // Reverting would drop the values an administrator may have set
    throw new Error("The security alert keys migration cannot be reverted.");
  },
};
