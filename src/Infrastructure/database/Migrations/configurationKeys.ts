import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext } from "./MigrationContext.js";

/** A configuration key that a migration adds with its default value. */
export interface ConfigurationKeyRow {
  key: string;
  value: unknown;
  type: string;
  description: string;
}

/**
 * Adds the keys of the admin that are missing, in one transaction. A key
 * already there keeps the value an administrator gave it. The migrations
 * 0002, 0010 and 0011 hold their own copy of this statement: an applied
 * migration never changes.
 */
export async function addConfigurationKeys(
  { sequelize, schema }: MigrationContext,
  migrationName: string,
  rows: readonly ConfigurationKeyRow[],
): Promise<void> {
  const added: string[] = [];
  await sequelize.transaction(async (transaction) => {
    for (const row of rows) {
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
    `[MIGRATION] ${migrationName}: ${added.length} key(s) added (${added.join(", ") || "none"}), ${rows.length - added.length} already present and left untouched`,
  );
}
