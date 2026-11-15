import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

// Creates a configuration from the screen (EV-18 lot C.3)
const CREATE_PERMISSION = "configurations::create";

// Whoever may change a configuration may create one (decision of 2026-11-15)
const UPDATE_PERMISSION = "configurations::update";

// Shared with the rest of the platform, not created by the baseline
const PERMISSION_TABLES = ["permission", "role", "role_permission"];

export const configurationCreatePermission: SchemaMigration = {
  name: "0029-configuration-create-permission",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    let granted = 0;
    const done = await sequelize.transaction(async (transaction) => {
      for (const table of PERMISSION_TABLES) {
        const [row] = await sequelize.query<{ exists: boolean }>(
          "SELECT to_regclass(:name) IS NOT NULL AS exists",
          {
            replacements: { name: `"${schema}"."${table}"` },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        if (!row?.exists) {
          return false;
        }
      }
      const replacements = {
        create: CREATE_PERMISSION,
        update: UPDATE_PERMISSION,
      };
      // No unique key on the name: one created by hand is kept, not doubled
      await sequelize.query(
        `INSERT INTO "${schema}"."permission" ("name")
         SELECT :create
          WHERE NOT EXISTS (
            SELECT 1 FROM "${schema}"."permission" WHERE "name" = :create)`,
        { replacements, transaction },
      );
      // Every role that holds the update permission, unless it has both
      const rows = await sequelize.query<{ role_id: number }>(
        `INSERT INTO "${schema}"."role_permission" ("role_id", "permission_id")
         SELECT DISTINCT holder."role_id", created."id"
           FROM "${schema}"."role_permission" holder
           JOIN "${schema}"."permission" updating
             ON updating."id" = holder."permission_id"
            AND updating."name" = :update
           JOIN "${schema}"."permission" created ON created."name" = :create
          WHERE NOT EXISTS (
            SELECT 1 FROM "${schema}"."role_permission" already
             WHERE already."role_id" = holder."role_id"
               AND already."permission_id" = created."id")
         RETURNING "role_id"`,
        { replacements, type: QueryTypes.SELECT, transaction },
      );
      granted = rows.length;
      return true;
    });
    logger.info(
      done
        ? `[MIGRATION] 0029-configuration-create-permission: ${CREATE_PERMISSION} ready, granted to ${granted} role(s) holding ${UPDATE_PERMISSION}`
        : `[MIGRATION] 0029-configuration-create-permission: no permission tables in this schema, ${CREATE_PERMISSION} to create in the Permissions page`,
    );
  },
  // Reverting would take the permission from roles an administrator gave it to
  down: refuseRollback("Configuration create permission"),
};
