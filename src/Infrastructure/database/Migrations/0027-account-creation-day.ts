import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// The new accounts of a period (0026) read user.created_at as a day. The
// shared user table belongs to another service, and the column is a date in
// one database, a timestamp with time zone in another (the test database of
// the e2e runs): the function failed there, and the whole statistics page
// with it. The value is now read as an instant and taken as its UTC day, as
// 0018 does for project.date, which accepts both types.

const newAccounts = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_new_accounts(startDate DATE, endDate DATE)
RETURNS TABLE(account_day DATE) AS $$
BEGIN
    IF to_regclass('${s}."user"') IS NOT NULL THEN
        RETURN QUERY SELECT d.account_day
            FROM (
                SELECT (u.created_at::TIMESTAMPTZ AT TIME ZONE 'UTC')::DATE AS account_day
                FROM ${s}."user" u
            ) AS d
            WHERE d.account_day BETWEEN startDate AND endDate;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

// No down step: 0026 holds the former text
export const accountCreationDay: SchemaMigration = {
  name: "0027-account-creation-day",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0027-account-creation-day: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.query(newAccounts(schema));
    logger.info(
      "[MIGRATION] 0027-account-creation-day: new accounts read from a date or an instant",
    );
  },
};
