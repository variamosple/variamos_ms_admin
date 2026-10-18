import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Values as of 2026-10-18 (EV-87 lot 4): a migration never changes once
// applied, so they are written here rather than read from the code
export const ACCOUNT_LOCKOUT_ROWS = [
  {
    key: "security.lockout.max_attempts",
    value: 10,
    description:
      "Failed sign-ins in a row after which an account is locked (3 to 100).",
  },
  {
    key: "security.lockout.duration_minutes",
    value: 15,
    description:
      "Minutes an account stays locked after too many failed sign-ins (1 to 1440).",
  },
];

export const accountLockoutKeys: SchemaMigration = {
  name: "0002-account-lockout-keys",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const added: string[] = [];
    await sequelize.transaction(async (transaction) => {
      for (const row of ACCOUNT_LOCKOUT_ROWS) {
        // A key already there keeps the value an administrator gave it
        const inserted = await sequelize.query<{ key: string }>(
          `INSERT INTO "${schema}"."configurations"
             ("key", "value", "type", "category", "requires_mfa", "is_secret",
              "environment_scope", "is_read_only", "target_services",
              "description", "updated_by", "created_at", "updated_at")
           VALUES (:key, CAST(:value AS jsonb), 'number', 'security', false, false,
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
      `[MIGRATION] 0002-account-lockout-keys: ${added.length} key(s) added (${added.join(", ") || "none"}), ${ACCOUNT_LOCKOUT_ROWS.length - added.length} already present and left untouched`,
    );
  },
  down: async () => {
    // Reverting would drop the values an administrator may have set
    throw new Error("The account lockout keys migration cannot be reverted.");
  },
};
