import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Opens the Laboratory: its backend checks it on every route, and the menu
// shows the Laboratory tab with it
const LABORATORY_ACCESS_PERMISSION = "laboratory::access";

// The only role given the permission here; an administrator grants it to
// other roles in the Roles page
const LABORATORY_ACCESS_ROLE = "Administrator";

// Shared with the rest of the platform, not created by the baseline
const PERMISSION_TABLES = ["permission", "role", "role_permission"];

export const laboratoryAccessPermission: SchemaMigration = {
  name: "0012-laboratory-access-permission",
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
        name: LABORATORY_ACCESS_PERMISSION,
        role: LABORATORY_ACCESS_ROLE,
      };
      // No unique key on the name: one created by hand is kept, not doubled
      await sequelize.query(
        `INSERT INTO "${schema}"."permission" ("name")
         SELECT :name
          WHERE NOT EXISTS (
            SELECT 1 FROM "${schema}"."permission" WHERE "name" = :name)`,
        { replacements, transaction },
      );
      const rows = await sequelize.query<{ role_id: number }>(
        `INSERT INTO "${schema}"."role_permission" ("role_id", "permission_id")
         SELECT r."id", p."id"
           FROM "${schema}"."role" r, "${schema}"."permission" p
          WHERE r."name" = :role AND p."name" = :name
         ON CONFLICT DO NOTHING
         RETURNING "role_id"`,
        { replacements, type: QueryTypes.SELECT, transaction },
      );
      granted = rows.length;
      return true;
    });
    logger.info(
      done
        ? `[MIGRATION] 0012-laboratory-access-permission: ${LABORATORY_ACCESS_PERMISSION} ready, granted to ${granted} ${LABORATORY_ACCESS_ROLE} role(s) that lacked it`
        : `[MIGRATION] 0012-laboratory-access-permission: no permission tables in this schema, ${LABORATORY_ACCESS_PERMISSION} to create in the Permissions page`,
    );
  },
  down: async () => {
    // Reverting would take the permission from roles an administrator gave it to
    throw new Error(
      "The Laboratory access permission migration cannot be reverted.",
    );
  },
};
