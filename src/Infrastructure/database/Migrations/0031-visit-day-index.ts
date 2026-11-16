import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const VISIT_DAY_INDEX = "page_visit_visit_date_idx";

// The visits of a period, read by their day (EV-92). Every chart of the
// statistics page over a period, and the first day of the overview, read
// page_visit by visit_date; its only index starts with the page, so each of
// them read the whole table. Measured on 2026-11-16 with a year of visits
// (110,000): the page went from 384 to 331 ms, and the gap grows with the
// table, which no nightly job empties any more.
// page_visit belongs to the platform database, not to the baseline: a schema
// without it is left as it is.
const statement = (s: string) => `DO $$
BEGIN
    IF to_regclass('"${s}".page_visit') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS "${VISIT_DAY_INDEX}"
            ON "${s}".page_visit (visit_date);
    END IF;
END $$`;

export const visitDayIndex: SchemaMigration = {
  name: "0031-visit-day-index",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0031-visit-day-index: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.query(statement(schema));
    logger.info(
      "[MIGRATION] 0031-visit-day-index: the visits of a period are read by their day",
    );
  },
  // An index only: removing it loses no data
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(
      `DROP INDEX IF EXISTS "${schema}"."${VISIT_DAY_INDEX}"`,
    );
  },
};
