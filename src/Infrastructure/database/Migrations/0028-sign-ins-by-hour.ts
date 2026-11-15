import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// When people sign in, by day of the week and hour (EV-90, asked by the
// project lead): a grid of 7 days by 24 hours from admin_access_logs, which
// keeps six months. The hours are those of the reader's time zone: a day of
// the period runs from its midnight there, so the grid can count a sign-in
// near midnight on another day than the sign-ins chart, which counts UTC
// days. Successful sign-ins only, by password or Google; the second step of
// a two-factor sign-in is not a second sign-in. No table changes.
//
// get_metrics(startDate, endDate, readerZone) gives every chart with the
// grid; get_metrics(startDate, endDate) now calls it with UTC.

export const SIGN_INS_BY_HOUR_FUNCTIONS = [
  "get_sign_ins_by_hour_metrics",
] as const;

// Days are ISO (1 is Monday), hours 0 to 23. All 168 cells, 0 when nobody
// signed in, and no data at all when nobody signed in over the period. A zone
// PostgreSQL does not know falls back to UTC; the title names the zone used.
const hourGrid = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_sign_ins_by_hour_metrics(
    startDate DATE, endDate DATE, readerZone TEXT)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    zone TEXT := 'UTC';
    chart_rows JSON;
BEGIN
    IF readerZone IS NOT NULL THEN
        BEGIN
            PERFORM now() AT TIME ZONE readerZone;
            zone := readerZone;
        EXCEPTION WHEN invalid_parameter_value THEN
            zone := 'UTC';
        END;
    END IF;
    IF to_regclass('${s}.admin_access_logs') IS NOT NULL THEN
        SELECT CASE WHEN bool_or(t.total IS NOT NULL) THEN
                   json_agg(json_build_object('day', c.day, 'hour', h.hour,
                            'count', COALESCE(t.total, 0)) ORDER BY c.day, h.hour)
               END
        INTO chart_rows
        FROM generate_series(1, 7) AS c(day)
        CROSS JOIN generate_series(0, 23) AS h(hour)
        LEFT JOIN (
            SELECT EXTRACT(ISODOW FROM al.occurred_at AT TIME ZONE zone)::INT AS day,
                   EXTRACT(HOUR FROM al.occurred_at AT TIME ZONE zone)::INT AS hour,
                   count(*)::BIGINT AS total
            FROM ${s}.admin_access_logs al
            WHERE al.event IN ('sign-in', 'sign-in.google')
              AND al.outcome = 'success'
              AND al.occurred_at >= ((startDate + TIME '00:00') AT TIME ZONE zone)
              AND al.occurred_at < ((endDate + 1 + TIME '00:00') AT TIME ZONE zone)
            GROUP BY 1, 2
        ) AS t ON t.day = c.day AND t.hour = h.hour;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('sign_ins_by_hour',
        'Sign-ins by day and hour (' || zone || ')', 'heatmap', 'hour',
        'day', '["day"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// The charts of 0026, in the order of the page, the grid after the sign-ins
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
    ) AS charts;
$$ LANGUAGE sql STABLE;`;

const metricsInUtc = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_metrics(startDate DATE, endDate DATE)
RETURNS JSON AS $$
    SELECT ${s}.get_metrics(startDate, endDate, 'UTC');
$$ LANGUAGE sql STABLE;`;

// The grid before the get_metrics that calls it
const signInsByHourStatements = (s: string): string[] => [
  hourGrid(s),
  metricsWithZone(s),
  metricsInUtc(s),
];

// No down step: 0026 holds the former text of get_metrics(startDate, endDate)
export const signInsByHour: SchemaMigration = {
  name: "0028-sign-ins-by-hour",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0028-sign-ins-by-hour: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of signInsByHourStatements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0028-sign-ins-by-hour: sign-ins by day of the week and hour, in the reader's time zone",
    );
  },
};
