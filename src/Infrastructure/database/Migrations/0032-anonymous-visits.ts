import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

// The visits are kept six months with their account (decision of the project
// lead, 2026-11-16), as the access journal: a row names an account and the
// quarter-hour of its visit. Past that, the daily retention job erases the
// account and the instant, and keeps the page, the day and the country: the
// visits counted by page, day and country stay, over every year.
// - page_visit.user_id may be NULL from now on; only the admin writes this
//   table (POST /v1/visits), always with an account;
// - metrics_user_activity (0018) leaves out a visit without an account: the
//   accounts active in a period would otherwise count it as one more, and the
//   share of returning accounts too. The counts of distinct visitors already
//   leave NULL out.

const anonymousVisits = (s: string) => `DO $$
BEGIN
    IF to_regclass('"${s}".page_visit') IS NOT NULL THEN
        ALTER TABLE "${s}".page_visit ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$`;

// As 0018, a visit without an account left out
const userActivity = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_user_activity(startDate DATE, endDate DATE)
RETURNS TABLE(activity_user TEXT, activity_day DATE) AS $$
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        RETURN QUERY SELECT pv.user_id::TEXT, pv.visit_date
            FROM ${s}.page_visit pv
            WHERE pv.user_id IS NOT NULL
              AND pv.visit_date BETWEEN startDate AND endDate;
    END IF;
    IF to_regclass('${s}.admin_access_logs') IS NOT NULL THEN
        RETURN QUERY SELECT al.user_id::TEXT, (al.occurred_at AT TIME ZONE 'UTC')::DATE
            FROM ${s}.admin_access_logs al
            WHERE al.outcome = 'success' AND al.event LIKE 'sign-in%'
              AND al.user_id IS NOT NULL
              AND (al.occurred_at AT TIME ZONE 'UTC')::DATE BETWEEN startDate AND endDate;
    END IF;
    IF to_regclass('${s}.project_history') IS NOT NULL THEN
        RETURN QUERY SELECT ph.user_id::TEXT, (ph.created_at AT TIME ZONE 'UTC')::DATE
            FROM ${s}.project_history ph
            WHERE ph.user_id IS NOT NULL
              AND (ph.created_at AT TIME ZONE 'UTC')::DATE BETWEEN startDate AND endDate;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

export const anonymousVisitsMigration: SchemaMigration = {
  name: "0032-anonymous-visits",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0032-anonymous-visits: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of [anonymousVisits(schema), userActivity(schema)]) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0032-anonymous-visits: a visit may lose its account past its retention",
    );
  },
  // Once visits have lost their account, NOT NULL cannot come back
  down: refuseRollback("anonymous visits"),
};
