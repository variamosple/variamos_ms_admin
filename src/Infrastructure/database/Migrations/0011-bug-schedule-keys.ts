import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Values as of 2026-10-30 (EV-18): a migration never changes once applied,
// so they are written here rather than read from the code
export const BUG_SCHEDULE_ROWS = [
  {
    key: "bugs.sync_interval_minutes",
    value: 15,
    type: "number",
    description:
      "Minutes between two synchronizations of the bugs with GitHub (5 to 1440). A change applies at once.",
  },
  {
    key: "bugs.rejected_retention_days",
    value: 7,
    type: "number",
    description:
      "Days a rejected bug is kept before its purge, attachments included (1 to 365).",
  },
];

export const bugScheduleKeys: SchemaMigration = {
  name: "0011-bug-schedule-keys",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const added: string[] = [];
    await sequelize.transaction(async (transaction) => {
      for (const row of BUG_SCHEDULE_ROWS) {
        // A key already there keeps the value an administrator gave it
        const inserted = await sequelize.query<{ key: string }>(
          `INSERT INTO "${schema}"."configurations"
             ("key", "value", "type", "category", "requires_mfa", "is_secret",
              "environment_scope", "is_read_only", "target_services",
              "description", "updated_by", "created_at", "updated_at")
           VALUES (:key, CAST(:value AS jsonb), :type, 'general', false, false,
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
      `[MIGRATION] 0011-bug-schedule-keys: ${added.length} key(s) added (${added.join(", ") || "none"}), ${BUG_SCHEDULE_ROWS.length - added.length} already present and left untouched`,
    );
  },
  down: async () => {
    // Reverting would drop the values an administrator may have set
    throw new Error("The bug schedule keys migration cannot be reverted.");
  },
};
