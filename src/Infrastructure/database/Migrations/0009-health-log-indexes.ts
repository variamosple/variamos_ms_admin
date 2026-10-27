import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const HEALTH_LOG_INDEX = "microservice_health_logs_service_checked_idx";
export const DAILY_STATS_KEY = "microservice_daily_stats_service_date_key";

// Health checks read per service and period (EV-101, OPT-11), and one row
// of daily statistics per service and day (OPT-06). Migrations run before
// the health checks start: nothing writes to these tables meanwhile.
const statements = (s: string) => [
  `CREATE INDEX IF NOT EXISTS "${HEALTH_LOG_INDEX}"
     ON "${s}"."microservice_health_logs" ("service_name", "checked_at")`,
  // The daily job added the rows of the last 30 days again at each run.
  // Keeps the row counting the most checks: one saved after a partial purge
  // of its day counts fewer; the oldest on a tie.
  `DELETE FROM "${s}"."microservice_daily_stats" AS d
    USING "${s}"."microservice_daily_stats" AS k
    WHERE k."service_name" = d."service_name"
      AND k."stat_date" = d."stat_date"
      AND (k."total_checks" > d."total_checks"
           OR (k."total_checks" = d."total_checks" AND k."id" < d."id"))`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = '${DAILY_STATS_KEY}'
          AND connamespace = '"${s}"'::regnamespace
     ) THEN
       ALTER TABLE "${s}"."microservice_daily_stats" ADD CONSTRAINT "${DAILY_STATS_KEY}"
         UNIQUE ("service_name", "stat_date");
     END IF;
   END $$`,
];

export const healthLogIndexes: SchemaMigration = {
  name: "0009-health-log-indexes",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0009-health-log-indexes: health log index and one daily row per service ready",
    );
  },
  down: async () => {
    // The duplicate rows removed cannot be restored
    throw new Error("The health log index migration cannot be reverted.");
  },
};
