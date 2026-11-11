import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// The four columns of the baseline stored without a time zone (EV-116) become
// absolute instants. Their values were all written in UTC: the database, the
// server and Sequelize (+00:00) were in UTC on 2026-11-10. Read in UTC, each
// value keeps the same instant.
export const ABSOLUTE_INSTANT_COLUMNS = [
  { table: "password_reset_tokens", column: "expires_at" },
  { table: "password_reset_tokens", column: "used_at" },
  { table: "password_reset_tokens", column: "created_at" },
  { table: "microservice_daily_stats", column: "created_at" },
] as const;

export const absoluteInstants: SchemaMigration = {
  name: "0016-absolute-instants",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const changed = await sequelize.transaction(async (transaction) => {
      let count = 0;
      for (const { table, column } of ABSOLUTE_INSTANT_COLUMNS) {
        const [row] = await sequelize.query<{ udt_name: string }>(
          `SELECT udt_name FROM information_schema.columns
            WHERE table_schema = :schema AND table_name = :table AND column_name = :column`,
          {
            replacements: { schema, table, column },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        if (!row || row.udt_name === "timestamptz") continue;
        await sequelize.query(
          `ALTER TABLE "${schema}"."${table}"
             ALTER COLUMN "${column}" TYPE timestamptz
             USING "${column}" AT TIME ZONE 'UTC'`,
          { transaction },
        );
        count++;
      }
      return count;
    });
    logger.info(
      `[MIGRATION] 0016-absolute-instants: ${changed} column(s) now hold absolute instants`,
    );
  },
};
