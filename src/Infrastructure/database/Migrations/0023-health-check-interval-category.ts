import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Written here rather than read from the code: a migration never changes
// once applied
export const HEALTH_CHECK_INTERVAL_CATEGORY_KEY =
  "monitoring.health_check_interval_seconds";

const moveCategory = async (
  { sequelize, schema }: MigrationContext,
  from: string,
  to: string,
): Promise<number> => {
  const [, moved] = await sequelize.query(
    `UPDATE "${schema}"."configurations"
        SET "category" = :to, "updated_at" = now()
      WHERE "key" = :key AND "category" = :from`,
    {
      replacements: { key: HEALTH_CHECK_INTERVAL_CATEGORY_KEY, from, to },
      type: QueryTypes.UPDATE,
    },
  );
  return moved;
};

/**
 * Migration 0022 filed the interval of the health checks under "general":
 * it belongs to the "monitoring" tab of the configuration screen. Only a key
 * still under "general" moves; its value is never touched.
 */
export const healthCheckIntervalCategory: SchemaMigration = {
  name: "0023-health-check-interval-category",
  up: async ({ context }: { context: MigrationContext }) => {
    const moved = await moveCategory(context, "general", "monitoring");
    logger.info(
      `[MIGRATION] 0023-health-check-interval-category: ${moved} key moved to the monitoring category`,
    );
  },
  // Harmless to revert: only the tab that shows the key changes
  down: async ({ context }: { context: MigrationContext }) => {
    await moveCategory(context, "monitoring", "general");
  },
};
