import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Usage statistics of the dashboard (EV-90 lots A.2 and A.3).
// The visit charts read page_visit, where the services record each visit:
// visits_summary, user_visit and yearly_visits_summary, which they read
// until now, stopped being fed in May 2025 (production, 2026-11-11). Three
// charts are added: active users and active projects by month, and the most
// used languages. Every figure is computed when the dashboard asks for it,
// so it is always up to date, without a scheduled job or a summary table.
// The tables of the other services (page_visit, project, project_history,
// model, language, country) may be missing, as in a test schema: the charts
// are then empty. Same signatures as 0015, so the dashboard keeps working.

export const USAGE_METRICS_FUNCTIONS = [
  "metrics_chart",
  "metrics_user_activity",
  "metrics_project_activity",
  "get_monthly_active_users_metrics",
  "get_monthly_active_projects_metrics",
  "get_top_languages_metrics",
] as const;

// The shape the dashboard reads, in the order of 0015
const chart = (s: string) => `CREATE OR REPLACE FUNCTION ${s}.metrics_chart(
    p_id TEXT, p_title TEXT, p_chart_type TEXT, p_label_key TEXT,
    p_default_filter TEXT, p_filters JSON, p_data JSON)
RETURNS JSON AS $$
    SELECT json_build_object(
        'id', p_id,
        'title', p_title,
        'chartType', p_chart_type,
        'defaultFilter', p_default_filter,
        'labelKey', p_label_key,
        'filters', p_filters,
        'data', p_data
    );
$$ LANGUAGE sql IMMUTABLE;`;

// A visit, a successful sign-in or a change to a project, by account and day
const userActivity = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_user_activity(startDate DATE, endDate DATE)
RETURNS TABLE(activity_user TEXT, activity_day DATE) AS $$
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        RETURN QUERY SELECT pv.user_id::TEXT, pv.visit_date
            FROM ${s}.page_visit pv
            WHERE pv.visit_date BETWEEN startDate AND endDate;
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

// A change in the history of a project, or its last save: project.date
// keeps only the last one, and the history starts in June 2026
const projectActivity = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_project_activity(startDate DATE, endDate DATE)
RETURNS TABLE(activity_project TEXT, activity_day DATE) AS $$
BEGIN
    IF to_regclass('${s}.project_history') IS NOT NULL THEN
        RETURN QUERY SELECT ph.project_id::TEXT, (ph.created_at AT TIME ZONE 'UTC')::DATE
            FROM ${s}.project_history ph
            WHERE (ph.created_at AT TIME ZONE 'UTC')::DATE BETWEEN startDate AND endDate;
    END IF;
    IF to_regclass('${s}.project') IS NOT NULL THEN
        RETURN QUERY SELECT p.id::TEXT, (p.date::TIMESTAMPTZ AT TIME ZONE 'UTC')::DATE
            FROM ${s}.project p
            WHERE p.date IS NOT NULL
              AND (p.date::TIMESTAMPTZ AT TIME ZONE 'UTC')::DATE BETWEEN startDate AND endDate;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

/** A chart function: its schema, name, chart id, title and counted column. */
interface ChartFunction {
  s: string;
  name: string;
  id: string;
  title: string;
  counted: string;
}

// A chart of one line, counted by month
const monthlyCount = ({
  s,
  name,
  id,
  title,
  series,
  activity,
  counted,
}: ChartFunction & {
  series: string;
  activity: string;
}) => `CREATE OR REPLACE FUNCTION ${s}.${name}(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    SELECT json_agg(json_build_object('series', '${series}', 'count', total, 'date', month) ORDER BY month)
    INTO chart_rows
    FROM (
        SELECT to_char(activity_day, 'YYYY-MM') AS month, count(DISTINCT ${counted}) AS total
        FROM ${s}.${activity}(startDate, endDate)
        GROUP BY 1
    ) AS monthly;
    RETURN QUERY SELECT ${s}.metrics_chart('${id}', '${title}', 'line', 'date',
        'series', '["series"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

const visitsByDay = ({
  s,
  name,
  id,
  title,
  counted,
}: ChartFunction) => `CREATE OR REPLACE FUNCTION ${s}.${name}(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT json_agg(json_build_object('page', page_id, 'count', total, 'date', visit_date)
                        ORDER BY visit_date, page_id)
        INTO chart_rows
        FROM (
            SELECT page_id, visit_date, ${counted} AS total
            FROM ${s}.page_visit
            WHERE visit_date BETWEEN startDate AND endDate
            GROUP BY page_id, visit_date
        ) AS daily;
    END IF;
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
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT json_agg(json_build_object('page', page_id, 'count', total, 'date', month)
                        ORDER BY page_id, month)
        INTO chart_rows
        FROM (
            SELECT page_id, to_char(visit_date, 'YYYY-MM') AS month, count(*) AS total
            FROM ${s}.page_visit
            WHERE visit_date BETWEEN startDate AND endDate
            GROUP BY page_id, month
        ) AS monthly;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('monthly_visits', 'Monthly Visits', 'line', 'date',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// Now with a period, which the dashboard filter sends; without one, the
// last three months, as before
const topPages = (s: string) => [
  `CREATE OR REPLACE FUNCTION ${s}.get_top_visited_pages_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT json_agg(json_build_object('page', page_id, 'count', total) ORDER BY total DESC, page_id)
        INTO chart_rows
        FROM (
            SELECT page_id, count(*) AS total
            FROM ${s}.page_visit
            WHERE visit_date BETWEEN startDate AND endDate
            GROUP BY page_id
            ORDER BY total DESC, page_id
            LIMIT 10
        ) AS pages;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('top_visited_pages', 'Top visited pages', 'doughnut', 'page',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`,
  `CREATE OR REPLACE FUNCTION ${s}.get_top_visited_pages_metrics()
RETURNS TABLE(char_data JSON) AS $$
BEGIN
    RETURN QUERY SELECT * FROM ${s}.get_top_visited_pages_metrics(
        (current_date - INTERVAL '3 months')::DATE, current_date);
END;
$$ LANGUAGE plpgsql STABLE;`,
];

// Visits by country, for each year
const yearlyVisits = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_yearly_visits_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL AND to_regclass('${s}.country') IS NOT NULL THEN
        SELECT json_object_agg(visit_year, countries) INTO chart_rows
        FROM (
            SELECT visit_year, json_agg(json_build_array(country_name, total) ORDER BY country_name) AS countries
            FROM (
                SELECT EXTRACT(YEAR FROM pv.visit_date)::TEXT AS visit_year,
                       COALESCE(c.name, 'NO COUNTRY') AS country_name, count(*) AS total
                FROM ${s}.page_visit pv
                LEFT JOIN ${s}.country c ON c.code = pv.country_code
                GROUP BY 1, 2
            ) AS by_country
            GROUP BY visit_year
        ) AS by_year;
    ELSIF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT json_object_agg(visit_year, countries) INTO chart_rows
        FROM (
            SELECT visit_year, json_agg(json_build_array('NO COUNTRY', total)) AS countries
            FROM (
                SELECT EXTRACT(YEAR FROM visit_date)::TEXT AS visit_year, count(*) AS total
                FROM ${s}.page_visit GROUP BY 1
            ) AS by_year_only
            GROUP BY visit_year
        ) AS by_year;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('yearly_visits', 'Yearly visits', 'geo', 'Country',
        EXTRACT(YEAR FROM current_date)::TEXT, NULL, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// Projects active in the period, by the language of their models
const topLanguages = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_top_languages_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    IF to_regclass('${s}.model') IS NOT NULL AND to_regclass('${s}.language') IS NOT NULL THEN
        SELECT json_agg(json_build_object('language', language_name, 'count', total)
                        ORDER BY total DESC, language_name)
        INTO chart_rows
        FROM (
            SELECT COALESCE(l.name, 'Language ' || m.language_id) AS language_name,
                   count(DISTINCT m.project_id) AS total
            FROM ${s}.model m
            LEFT JOIN ${s}.language l ON l.id = m.language_id
            WHERE m.project_id IN (
                SELECT activity_project FROM ${s}.metrics_project_activity(startDate, endDate))
            GROUP BY m.language_id, l.name
            ORDER BY total DESC, language_name
            LIMIT 10
        ) AS languages;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('top_languages', 'Most used languages (projects)', 'pie',
        'language', 'language', '["language"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

const metrics = (s: string) => `CREATE OR REPLACE FUNCTION ${s}.get_metrics()
RETURNS JSON AS $$
DECLARE
    metrics_data JSON;
    dailyStartDate DATE := current_date - INTERVAL '3 months';
    dailyEndDate DATE := current_date;
    monthlyStartDate DATE := current_date - INTERVAL '24 months';
    yearlyStartDate DATE := current_date - INTERVAL '12 months';
BEGIN
    SELECT json_agg(char_data)
    INTO metrics_data
    FROM (
        SELECT char_data FROM ${s}.get_yearly_visits_metrics()
        UNION ALL
        SELECT char_data FROM ${s}.get_daily_visits_metrics(dailyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM ${s}.get_daily_unique_visits_metrics(dailyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM ${s}.get_monthly_visits_metrics(monthlyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM ${s}.get_top_visited_pages_metrics()
        UNION ALL
        SELECT char_data FROM ${s}.get_monthly_active_users_metrics(monthlyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM ${s}.get_monthly_active_projects_metrics(monthlyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM ${s}.get_top_languages_metrics(yearlyStartDate, dailyEndDate)
    ) as data;

    RETURN metrics_data;
END;
$$ LANGUAGE plpgsql;`;

// get_metrics() calls all the others: it comes last
export const usageMetricsStatements = (s: string): string[] => [
  chart(s),
  userActivity(s),
  projectActivity(s),
  visitsByDay({
    s,
    name: "get_daily_visits_metrics",
    id: "daily_visits",
    title: "Daily Visits",
    counted: "count(*)",
  }),
  visitsByDay({
    s,
    name: "get_daily_unique_visits_metrics",
    id: "daily_unique_visits",
    title: "Daily Unique Visits",
    counted: "count(DISTINCT user_id)",
  }),
  monthlyVisits(s),
  ...topPages(s),
  yearlyVisits(s),
  monthlyCount({
    s,
    name: "get_monthly_active_users_metrics",
    id: "monthly_active_users",
    title: "Monthly active users",
    series: "Active users",
    activity: "metrics_user_activity",
    counted: "activity_user",
  }),
  monthlyCount({
    s,
    name: "get_monthly_active_projects_metrics",
    id: "monthly_active_projects",
    title: "Monthly active projects",
    series: "Active projects",
    activity: "metrics_project_activity",
    counted: "activity_project",
  }),
  topLanguages(s),
  metrics(s),
];

// No down step: 0015 holds the former text, which read the summary tables
export const usageMetrics: SchemaMigration = {
  name: "0018-usage-metrics",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0018-usage-metrics: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of usageMetricsStatements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0018-usage-metrics: statistics read from the recorded visits, projects and languages",
    );
  },
};
