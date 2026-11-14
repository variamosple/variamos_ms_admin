import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// The visits recorded before May 2025 (EV-90). Until 2025-05-16, a pgAgent
// job of the production database (visit_metrics) summed each day into
// visits_summary, by page, then deleted that day from page_visit: the visits
// from 2025-02-11 to 2025-05-12 exist only in the summary. Since 0018 the
// charts read page_visit alone, so they had lost them.
// The visit charts now read both: visits_summary for the days before the
// first visit of page_visit, page_visit from that day on, so that no day is
// counted twice. unique_visits holds the distinct visitors of a page on a
// day, which is what daily_unique_visits counts. The summary kept neither
// the accounts nor the countries: active users and the map by country start
// with page_visit. Same signatures as 0018.

export const VISIT_HISTORY_FUNCTIONS = ["metrics_page_visits"] as const;

// The visits of each page and day, from both sources
const pageVisits = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_page_visits(startDate DATE, endDate DATE)
RETURNS TABLE(visit_page TEXT, visit_day DATE, visits BIGINT, unique_visits BIGINT) AS $$
DECLARE
    first_recorded DATE;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT min(pv.visit_date) INTO first_recorded FROM ${s}.page_visit pv;
        RETURN QUERY SELECT pv.page_id::TEXT, pv.visit_date, count(*), count(DISTINCT pv.user_id)
            FROM ${s}.page_visit pv
            WHERE pv.visit_date BETWEEN startDate AND endDate
            GROUP BY pv.page_id, pv.visit_date;
    END IF;
    IF to_regclass('${s}.visits_summary') IS NOT NULL THEN
        RETURN QUERY SELECT vs.page_id::TEXT, vs.visits_date,
                sum(vs.visits)::BIGINT, sum(vs.unique_visits)::BIGINT
            FROM ${s}.visits_summary vs
            WHERE vs.visits_date BETWEEN startDate AND endDate
              AND (first_recorded IS NULL OR vs.visits_date < first_recorded)
            GROUP BY vs.page_id, vs.visits_date;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

/** A chart of visits by page and day: its function, id, title and column. */
interface DailyChart {
  s: string;
  name: string;
  id: string;
  title: string;
  counted: "visits" | "unique_visits";
}

const visitsByDay = ({
  s,
  name,
  id,
  title,
  counted,
}: DailyChart) => `CREATE OR REPLACE FUNCTION ${s}.${name}(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    SELECT json_agg(json_build_object('page', visit_page, 'count', total, 'date', visit_day)
                    ORDER BY visit_day, visit_page)
    INTO chart_rows
    FROM (
        SELECT visit_page, visit_day, sum(${counted})::BIGINT AS total
        FROM ${s}.metrics_page_visits(startDate, endDate)
        GROUP BY visit_page, visit_day
    ) AS daily;
    RETURN QUERY SELECT ${s}.metrics_chart('${id}', '${title}', 'line', 'date',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

const monthlyVisits = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_monthly_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    SELECT json_agg(json_build_object('page', visit_page, 'count', total, 'date', month)
                    ORDER BY visit_page, month)
    INTO chart_rows
    FROM (
        SELECT visit_page, to_char(visit_day, 'YYYY-MM') AS month, sum(visits)::BIGINT AS total
        FROM ${s}.metrics_page_visits(startDate, endDate)
        GROUP BY visit_page, month
    ) AS monthly;
    RETURN QUERY SELECT ${s}.metrics_chart('monthly_visits', 'Monthly Visits', 'line', 'date',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// The version without a period, from 0018, calls this one
const topPages = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_top_visited_pages_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    SELECT json_agg(json_build_object('page', visit_page, 'count', total) ORDER BY total DESC, visit_page)
    INTO chart_rows
    FROM (
        SELECT visit_page, sum(visits)::BIGINT AS total
        FROM ${s}.metrics_page_visits(startDate, endDate)
        GROUP BY visit_page
        ORDER BY total DESC, visit_page
        LIMIT 10
    ) AS pages;
    RETURN QUERY SELECT ${s}.metrics_chart('top_visited_pages', 'Top visited pages', 'doughnut', 'page',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// The helper comes first: the charts call it
const visitHistoryStatements = (s: string): string[] => [
  pageVisits(s),
  visitsByDay({
    s,
    name: "get_daily_visits_metrics",
    id: "daily_visits",
    title: "Daily Visits",
    counted: "visits",
  }),
  visitsByDay({
    s,
    name: "get_daily_unique_visits_metrics",
    id: "daily_unique_visits",
    title: "Daily Unique Visits",
    counted: "unique_visits",
  }),
  monthlyVisits(s),
  topPages(s),
];

// No down step: 0018 holds the former text, which read page_visit alone
export const visitHistory: SchemaMigration = {
  name: "0025-visit-history",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0025-visit-history: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of visitHistoryStatements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0025-visit-history: visit charts read the summary of the days before page_visit",
    );
  },
};
