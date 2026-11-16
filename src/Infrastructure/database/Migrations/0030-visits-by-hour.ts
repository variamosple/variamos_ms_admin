import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

// When people visit, by day of the week and hour (EV-90 lot 2, asked by the
// project lead): page_visit kept the day of a visit only. It gains the
// instant, in a column of its own:
// - added without a default first, so that the visits already recorded keep
//   no instant: a default given with the column would stamp them all with
//   the time of this migration;
// - then a default, which the insert of POST /v1/visits leaves to the
//   database: the PLE, the laboratory and the admin change nothing;
// - rounded down to the quarter-hour: the row already names the account,
//   and an exact instant would tell more about a person than a grid of hours
//   needs. Every time zone is a whole number of quarter-hours from UTC, so a
//   rounded instant falls in the same hour in any zone.
// The grid reads the visits that have an instant: it starts empty, and the
// title says from which day it counts when the period starts before.
//
// get_metrics(startDate, endDate, readerZone) gives the grid last, after the
// visits by country: the page draws them side by side, where and when people
// visit, and the half-width charts before keep their pairs.
// get_metrics(startDate, endDate) still calls it with UTC (0028).

export const VISITS_BY_HOUR_FUNCTIONS = ["get_visits_by_hour_metrics"] as const;

const VISITED_AT_COLUMN = "visited_at";

// No more than this from the time of the insert
export const VISIT_INSTANT_STEP_SECONDS = 900;

const visitedAtDefault = `to_timestamp(floor(extract(epoch FROM now()) / ${VISIT_INSTANT_STEP_SECONDS}) * ${VISIT_INSTANT_STEP_SECONDS})`;

// page_visit belongs to the platform database, not to the baseline: a schema
// without it gets the function alone, which then draws nothing
const visitedAtColumn = (s: string) => `DO $$
BEGIN
    IF to_regclass('"${s}".page_visit') IS NOT NULL THEN
        ALTER TABLE "${s}".page_visit ADD COLUMN IF NOT EXISTS ${VISITED_AT_COLUMN} timestamptz;
        ALTER TABLE "${s}".page_visit ALTER COLUMN ${VISITED_AT_COLUMN} SET DEFAULT ${visitedAtDefault};
        -- Only the visits that have an instant: the index stays small, and
        -- the grid reads a period through it
        CREATE INDEX IF NOT EXISTS page_visit_visited_at_idx
            ON "${s}".page_visit (${VISITED_AT_COLUMN}) WHERE ${VISITED_AT_COLUMN} IS NOT NULL;
    END IF;
END $$`;

// Same grid as the sign-ins (0028): ISO days (1 is Monday), hours 0 to 23,
// all 168 cells, no data at all when no visit of the period has an instant
const hourGrid = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_visits_by_hour_metrics(
    startDate DATE, endDate DATE, readerZone TEXT)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    zone TEXT := 'UTC';
    chart_rows JSON;
    first_day DATE;
    title TEXT;
BEGIN
    IF readerZone IS NOT NULL THEN
        BEGIN
            PERFORM now() AT TIME ZONE readerZone;
            zone := readerZone;
        EXCEPTION WHEN invalid_parameter_value THEN
            zone := 'UTC';
        END;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute
               WHERE attrelid = to_regclass('${s}.page_visit')
                 AND attname = '${VISITED_AT_COLUMN}' AND NOT attisdropped) THEN
        SELECT (min(pv.${VISITED_AT_COLUMN}) AT TIME ZONE zone)::DATE INTO first_day
        FROM ${s}.page_visit pv
        WHERE pv.${VISITED_AT_COLUMN} IS NOT NULL;
        SELECT CASE WHEN bool_or(t.total IS NOT NULL) THEN
                   json_agg(json_build_object('day', c.day, 'hour', h.hour,
                            'count', COALESCE(t.total, 0)) ORDER BY c.day, h.hour)
               END
        INTO chart_rows
        FROM generate_series(1, 7) AS c(day)
        CROSS JOIN generate_series(0, 23) AS h(hour)
        LEFT JOIN (
            SELECT EXTRACT(ISODOW FROM pv.${VISITED_AT_COLUMN} AT TIME ZONE zone)::INT AS day,
                   EXTRACT(HOUR FROM pv.${VISITED_AT_COLUMN} AT TIME ZONE zone)::INT AS hour,
                   count(*)::BIGINT AS total
            FROM ${s}.page_visit pv
            WHERE pv.${VISITED_AT_COLUMN} >= ((startDate + TIME '00:00') AT TIME ZONE zone)
              AND pv.${VISITED_AT_COLUMN} < ((endDate + 1 + TIME '00:00') AT TIME ZONE zone)
            GROUP BY 1, 2
        ) AS t ON t.day = c.day AND t.hour = h.hour;
    END IF;
    title := 'Visits by day and hour (' || zone || ')';
    IF first_day IS NULL THEN
        title := title || ', not recorded yet';
    ELSIF first_day > startDate THEN
        title := title || ', recorded since ' || to_char(first_day, 'YYYY-MM-DD');
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('visits_by_hour', title, 'heatmap',
        'hour', 'day', '["day"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// The charts of 0028, the visit grid last
const metricsWithZone = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_metrics(startDate DATE, endDate DATE, readerZone TEXT)
RETURNS JSON AS $$
    SELECT json_agg(char_data) FROM (
        SELECT char_data FROM ${s}.get_overview_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_content_metrics()
        UNION ALL SELECT char_data FROM ${s}.get_visits_over_time_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_activity_over_time_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_top_visited_pages_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_top_languages_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_sign_ins_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_sign_ins_by_hour_metrics(startDate, endDate, readerZone)
        UNION ALL SELECT char_data FROM ${s}.get_new_accounts_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_models_by_type_metrics()
        UNION ALL SELECT char_data FROM ${s}.get_yearly_visits_metrics()
        UNION ALL SELECT char_data FROM ${s}.get_visits_by_hour_metrics(startDate, endDate, readerZone)
    ) AS charts;
$$ LANGUAGE sql STABLE;`;

// The column before the grid that reads it, the grid before get_metrics
const visitsByHourStatements = (s: string): string[] => [
  visitedAtColumn(s),
  hourGrid(s),
  metricsWithZone(s),
];

export const visitsByHour: SchemaMigration = {
  name: "0030-visits-by-hour",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0030-visits-by-hour: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of visitsByHourStatements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0030-visits-by-hour: page_visit records the quarter-hour of a visit, shown by day of the week and hour",
    );
  },
  // The instants recorded since would be lost with the column
  down: refuseRollback("visit instant"),
};
