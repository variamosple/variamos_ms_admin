import { QueryTypes, type Transaction } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const PERMISSION_NAME_CHECK = "permission_name_format";

// The format the domain already demands ('resource::action' or
// 'scope::resource::action', see Permission.ts), written as a PostgreSQL
// regular expression, which has no non-capturing group (EV-70 lot 4).
// A name inserted by hand in SQL would otherwise pass, and the module would
// then fail to read it, and every role that holds it.
export const PERMISSION_NAME_PATTERN =
  "^([a-z0-9-]+::)?[a-z0-9-]+::[a-z0-9-]+$";

// Production held no name out of this format on 2026-11-10
export const permissionNameFormat: SchemaMigration = {
  name: "0014-permission-name-format",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const outcome = await sequelize.transaction(async (transaction) => {
      const one = <T extends object>(sql: string) =>
        sequelize
          .query<T>(sql, {
            replacements: {
              table: `"${schema}"."permission"`,
              schema,
              check: PERMISSION_NAME_CHECK,
              pattern: PERMISSION_NAME_PATTERN,
            },
            type: QueryTypes.SELECT,
            transaction,
          })
          .then((rows) => rows[0]);

      // The permission tables belong to the shared schema, not to the baseline
      const table = await one<{ exists: boolean }>(
        "SELECT to_regclass(:table) IS NOT NULL AS exists",
      );
      if (!table?.exists) return "no-table";
      const existing = await one<{ found: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conname = :check AND connamespace = :schema::regnamespace
         ) AS found`,
      );
      if (existing?.found) return "present";
      const outside = await one<{ count: string }>(
        `SELECT count(*) AS count FROM "${schema}"."permission"
          WHERE "name" !~ :pattern`,
      );
      const invalid = Number(outside?.count ?? 0);
      await addCheck(sequelize, schema, invalid > 0, transaction);
      return invalid > 0 ? `not-valid:${invalid}` : "added";
    });

    if (outcome === "no-table") {
      logger.warn(
        "[MIGRATION] 0014-permission-name-format: no permission table, nothing to check",
      );
    } else if (outcome.startsWith("not-valid:")) {
      // The rows already there are kept: new and renamed ones are checked
      logger.warn(
        `[MIGRATION] 0014-permission-name-format: ${outcome.slice(10)} name(s) out of format kept; the format applies to new and renamed permissions`,
      );
    } else {
      logger.info(
        "[MIGRATION] 0014-permission-name-format: permission names checked by the database",
      );
    }
  },
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const [row] = await sequelize.query<{ exists: boolean }>(
      "SELECT to_regclass(:table) IS NOT NULL AS exists",
      {
        replacements: { table: `"${schema}"."permission"` },
        type: QueryTypes.SELECT,
      },
    );
    if (row?.exists) {
      await sequelize.query(
        `ALTER TABLE "${schema}"."permission" DROP CONSTRAINT IF EXISTS "${PERMISSION_NAME_CHECK}"`,
      );
    }
  },
};

const addCheck = (
  sequelize: MigrationContext["sequelize"],
  schema: string,
  notValid: boolean,
  transaction: Transaction,
) =>
  sequelize.query(
    `ALTER TABLE "${schema}"."permission"
       ADD CONSTRAINT "${PERMISSION_NAME_CHECK}"
       CHECK ("name" ~ '${PERMISSION_NAME_PATTERN}')${notValid ? " NOT VALID" : ""}`,
    { transaction },
  );
