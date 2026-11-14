import logger from "#src/common/logger.js";
import { PLAIN_SCHEMA } from "./0015-versioned-functions.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// The statistics page for one period (EV-90). The dashboard drew one line per
// page and day, summed the distinct visitors of each page, and put ten
// slices in a pie: unreadable. It now asks every chart for the same period:
// - key figures, each with the figure of the period of the same length just
//   before (overview), and what the platform holds today (content_overview);
// - visits and visitors, active users and projects, sign-ins and new
//   accounts over time, by day up to three months, by week up to a year,
//   by month beyond; a day without activity counts 0;
// - pages, languages and model types as rankings.
// Visitors are distinct accounts. Before page_visit starts (May 2025) the
// summary kept only the visitors of each page: a day counts those of its
// most visited page, the fewest it can have had.

export const USAGE_OVERVIEW_FUNCTIONS = [
  "metrics_bucket",
  "metrics_buckets",
  "metrics_visitors_by_bucket",
  "metrics_visitor_total",
  "metrics_returning_share",
  "metrics_sign_ins",
  "metrics_new_accounts",
  "get_overview_metrics",
  "get_content_metrics",
  "get_visits_over_time_metrics",
  "get_activity_over_time_metrics",
  "get_sign_ins_metrics",
  "get_new_accounts_metrics",
  "get_models_by_type_metrics",
] as const;

// The step of a period: a day up to 3 months, a week (its Monday) up to a
// year, a month beyond. Labels sort as text in time order.
const bucket = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_bucket(startDate DATE, endDate DATE, on_day DATE)
RETURNS TEXT AS $$
    SELECT CASE
        WHEN endDate - startDate <= 92 THEN to_char(on_day, 'YYYY-MM-DD')
        WHEN endDate - startDate <= 366 THEN to_char(date_trunc('week', on_day), 'YYYY-MM-DD')
        ELSE to_char(on_day, 'YYYY-MM')
    END;
$$ LANGUAGE sql IMMUTABLE;`;

const buckets = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_buckets(startDate DATE, endDate DATE)
RETURNS TABLE(bucket TEXT) AS $$
    SELECT DISTINCT ${s}.metrics_bucket(startDate, endDate, d::DATE)
    FROM generate_series(startDate, endDate, INTERVAL '1 day') AS d;
$$ LANGUAGE sql IMMUTABLE;`;

// Distinct visitors of each step; a step that straddles the start of
// page_visit comes twice, once from each source, and the callers add them
const visitorsByBucket = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_visitors_by_bucket(startDate DATE, endDate DATE)
RETURNS TABLE(bucket TEXT, visitors BIGINT) AS $$
DECLARE
    first_recorded DATE;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT min(pv.visit_date) INTO first_recorded FROM ${s}.page_visit pv;
        RETURN QUERY SELECT ${s}.metrics_bucket(startDate, endDate, pv.visit_date), count(DISTINCT pv.user_id)
            FROM ${s}.page_visit pv
            WHERE pv.visit_date BETWEEN startDate AND endDate
            GROUP BY 1;
    END IF;
    IF to_regclass('${s}.visits_summary') IS NOT NULL THEN
        RETURN QUERY SELECT ${s}.metrics_bucket(startDate, endDate, d.visits_date), sum(d.most)::BIGINT
            FROM (
                SELECT vs.visits_date, max(vs.unique_visits) AS most
                FROM ${s}.visits_summary vs
                WHERE vs.visits_date BETWEEN startDate AND endDate
                  AND (first_recorded IS NULL OR vs.visits_date < first_recorded)
                GROUP BY vs.visits_date
            ) AS d
            GROUP BY 1;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

const visitorTotal = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_visitor_total(startDate DATE, endDate DATE)
RETURNS BIGINT AS $$
DECLARE
    first_recorded DATE;
    recorded BIGINT := 0;
    summed BIGINT := 0;
BEGIN
    IF to_regclass('${s}.page_visit') IS NOT NULL THEN
        SELECT min(pv.visit_date) INTO first_recorded FROM ${s}.page_visit pv;
        SELECT count(DISTINCT pv.user_id) INTO recorded
            FROM ${s}.page_visit pv
            WHERE pv.visit_date BETWEEN startDate AND endDate;
    END IF;
    IF to_regclass('${s}.visits_summary') IS NOT NULL THEN
        SELECT COALESCE(sum(d.most), 0) INTO summed
            FROM (
                SELECT max(vs.unique_visits) AS most
                FROM ${s}.visits_summary vs
                WHERE vs.visits_date BETWEEN startDate AND endDate
                  AND (first_recorded IS NULL OR vs.visits_date < first_recorded)
                GROUP BY vs.visits_date
            ) AS d;
    END IF;
    RETURN recorded + summed;
END;
$$ LANGUAGE plpgsql STABLE;`;

// Of the accounts active in the period just before, the share (%) active
// again in this one; none when nobody was active before
const returningShare = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_returning_share(startDate DATE, endDate DATE)
RETURNS NUMERIC AS $$
    WITH earlier AS (
        SELECT DISTINCT activity_user FROM ${s}.metrics_user_activity(
            startDate - (endDate - startDate + 1), startDate - 1)
    ), current_period AS (
        SELECT DISTINCT activity_user FROM ${s}.metrics_user_activity(startDate, endDate)
    )
    SELECT round(100.0 * count(c.activity_user) / NULLIF(count(*), 0))
    FROM earlier e LEFT JOIN current_period c ON c.activity_user = e.activity_user;
$$ LANGUAGE sql STABLE;`;

// The second step of a two-factor sign-in (sign-in.mfa) is not counted again
const signIns = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_sign_ins(startDate DATE, endDate DATE)
RETURNS TABLE(sign_in_day DATE, sign_in_kind TEXT) AS $$
BEGIN
    IF to_regclass('${s}.admin_access_logs') IS NOT NULL THEN
        RETURN QUERY SELECT (al.occurred_at AT TIME ZONE 'UTC')::DATE,
                CASE WHEN al.outcome = 'failed' THEN 'Failed'
                     WHEN al.event = 'sign-in.google' THEN 'Google'
                     ELSE 'Password' END
            FROM ${s}.admin_access_logs al
            WHERE al.event IN ('sign-in', 'sign-in.google')
              AND (al.occurred_at AT TIME ZONE 'UTC')::DATE BETWEEN startDate AND endDate;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

const newAccounts = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.metrics_new_accounts(startDate DATE, endDate DATE)
RETURNS TABLE(account_day DATE) AS $$
BEGIN
    IF to_regclass('${s}."user"') IS NOT NULL THEN
        RETURN QUERY SELECT u.created_at
            FROM ${s}."user" u
            WHERE u.created_at BETWEEN startDate AND endDate;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;`;

/** A key figure: its key, label, unit and the SQL of its value. */
interface KeyFigure {
  key: string;
  label: string;
  unit: "count" | "percent" | "decimal";
  /** The value over (startDate, endDate); the text "$start, $end" is replaced. */
  value: string;
}

const KEY_FIGURES = (s: string): KeyFigure[] => [
  {
    key: "visits",
    label: "Visits",
    unit: "count",
    value: `(SELECT COALESCE(sum(visits), 0) FROM ${s}.metrics_page_visits($start, $end))`,
  },
  {
    key: "visitors",
    label: "Visitors",
    unit: "count",
    value: `${s}.metrics_visitor_total($start, $end)`,
  },
  {
    key: "active_users",
    label: "Active users",
    unit: "count",
    value: `(SELECT count(DISTINCT activity_user) FROM ${s}.metrics_user_activity($start, $end))`,
  },
  {
    key: "returning_users",
    label: "Returning users",
    unit: "percent",
    value: `${s}.metrics_returning_share($start, $end)`,
  },
  {
    key: "active_projects",
    label: "Active projects",
    unit: "count",
    value: `(SELECT count(DISTINCT activity_project) FROM ${s}.metrics_project_activity($start, $end))`,
  },
  {
    key: "new_accounts",
    label: "New accounts",
    unit: "count",
    value: `(SELECT count(*) FROM ${s}.metrics_new_accounts($start, $end))`,
  },
  {
    key: "sign_ins",
    label: "Sign-ins",
    unit: "count",
    value: `(SELECT count(*) FROM ${s}.metrics_sign_ins($start, $end) WHERE sign_in_kind <> 'Failed')`,
  },
  {
    key: "failed_sign_ins",
    label: "Failed sign-ins",
    unit: "count",
    value: `(SELECT count(*) FROM ${s}.metrics_sign_ins($start, $end) WHERE sign_in_kind = 'Failed')`,
  },
];

const between = (sql: string, start: string, end: string) =>
  sql.replaceAll("$start", start).replaceAll("$end", end);

const overview = (s: string) => {
  const rows = KEY_FIGURES(s)
    .map(
      (f, i) =>
        `SELECT ${i} AS ord, '${f.key}' AS key, '${f.label}' AS label, '${f.unit}' AS unit,
               ${between(f.value, "startDate", "endDate")}::NUMERIC AS current_value,
               ${between(f.value, "previousStart", "previousEnd")}::NUMERIC AS previous_value`,
    )
    .join("\n        UNION ALL\n        ");
  return `CREATE OR REPLACE FUNCTION ${s}.get_overview_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    previousStart DATE := startDate - (endDate - startDate + 1);
    previousEnd DATE := startDate - 1;
    chart_rows JSON;
BEGIN
    SELECT json_agg(json_build_object('key', key, 'label', label, 'unit', unit,
                    'count', current_value, 'previous', previous_value) ORDER BY ord)
    INTO chart_rows
    FROM (
        ${rows}
    ) AS figures;
    RETURN QUERY SELECT ${s}.metrics_chart('overview', 'Overview', 'kpi', 'key',
        'key', '["key"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;
};

// What the platform holds today, whatever the period
const content = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_content_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
    accounts BIGINT;
    projects BIGINT;
    collaborative BIGINT;
    models BIGINT;
    languages BIGINT;
BEGIN
    IF to_regclass('${s}."user"') IS NOT NULL THEN
        SELECT count(*) INTO accounts FROM ${s}."user" u WHERE NOT u.is_deleted;
    END IF;
    IF to_regclass('${s}.project') IS NOT NULL THEN
        SELECT count(*), count(*) FILTER (WHERE p.is_collaborative)
            INTO projects, collaborative
            FROM ${s}.project p WHERE NOT p.is_deleted;
    END IF;
    IF to_regclass('${s}.model') IS NOT NULL THEN
        SELECT count(*), count(DISTINCT m.language_id) INTO models, languages
            FROM ${s}.model m WHERE NOT m.is_deleted;
    END IF;
    IF accounts IS NOT NULL OR projects IS NOT NULL OR models IS NOT NULL THEN
        SELECT json_agg(json_build_object('key', key, 'label', label, 'unit', unit,
                        'count', figure) ORDER BY ord)
        INTO chart_rows
        FROM (VALUES
            (0, 'accounts', 'Accounts', 'count', accounts::NUMERIC),
            (1, 'projects', 'Projects', 'count', projects::NUMERIC),
            (2, 'collaborative_projects', 'Collaborative projects', 'percent',
                round(100.0 * collaborative / NULLIF(projects, 0))),
            (3, 'models', 'Models', 'count', models::NUMERIC),
            (4, 'models_per_project', 'Models per project', 'decimal',
                round(models::NUMERIC / NULLIF(projects, 0), 1)),
            (5, 'languages_in_use', 'Languages in use', 'count', languages::NUMERIC)
        ) AS figures(ord, key, label, unit, figure);
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('content_overview', 'On the platform today', 'kpi', 'key',
        'key', '["key"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

/** One series of a chart over time: its name, and rows of (bucket, total). */
interface Series {
  label: string;
  rows: string;
}

// A chart over time, each step of the period present, empty without data
const overTime = ({
  s,
  name,
  id,
  title,
  chartType,
  series,
}: {
  s: string;
  name: string;
  id: string;
  title: string;
  chartType: "line" | "bar";
  series: Series[];
}) => `CREATE OR REPLACE FUNCTION ${s}.${name}(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    SELECT CASE WHEN bool_or(t.total IS NOT NULL) THEN
               json_agg(json_build_object('series', v.series, 'count', COALESCE(t.total, 0),
                        'date', b.bucket) ORDER BY b.bucket, v.ord)
           END
    INTO chart_rows
    FROM ${s}.metrics_buckets(startDate, endDate) AS b
    CROSS JOIN (VALUES ${series.map((x, i) => `(${i}, '${x.label}')`).join(", ")}) AS v(ord, series)
    LEFT JOIN (
        ${series
          .map(
            (x) =>
              `SELECT '${x.label}'::TEXT AS series, r.bucket, sum(r.total)::BIGINT AS total
            FROM (${x.rows}) AS r GROUP BY r.bucket`,
          )
          .join("\n        UNION ALL\n        ")}
    ) AS t ON t.series = v.series AND t.bucket = b.bucket;
    RETURN QUERY SELECT ${s}.metrics_chart('${id}', '${title}', '${chartType}', 'date',
        'series', '["series"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

const step = (s: string, day: string) =>
  `${s}.metrics_bucket(startDate, endDate, ${day})`;

const distinctBy = (s: string, fn: string, counted: string) =>
  `SELECT x.bucket, count(DISTINCT x.${counted}) AS total
                FROM (SELECT ${step(s, "a.activity_day")} AS bucket, a.${counted}
                      FROM ${s}.${fn}(startDate, endDate) AS a) AS x
                GROUP BY x.bucket`;

const signInsOf = (s: string, kind: string) =>
  `SELECT ${step(s, "g.sign_in_day")} AS bucket, 1 AS total
                FROM ${s}.metrics_sign_ins(startDate, endDate) AS g WHERE g.sign_in_kind = '${kind}'`;

const overTimeCharts = (s: string): string[] => [
  overTime({
    s,
    name: "get_visits_over_time_metrics",
    id: "visits_over_time",
    title: "Visits and visitors",
    chartType: "line",
    series: [
      {
        label: "Visits",
        rows: `SELECT ${step(s, "p.visit_day")} AS bucket, p.visits AS total
                FROM ${s}.metrics_page_visits(startDate, endDate) AS p`,
      },
      {
        label: "Visitors",
        rows: `SELECT q.bucket, q.visitors AS total
                FROM ${s}.metrics_visitors_by_bucket(startDate, endDate) AS q`,
      },
    ],
  }),
  overTime({
    s,
    name: "get_activity_over_time_metrics",
    id: "activity_over_time",
    title: "Active users and projects",
    chartType: "line",
    series: [
      {
        label: "Active users",
        rows: distinctBy(s, "metrics_user_activity", "activity_user"),
      },
      {
        label: "Active projects",
        rows: distinctBy(s, "metrics_project_activity", "activity_project"),
      },
    ],
  }),
  overTime({
    s,
    name: "get_sign_ins_metrics",
    id: "sign_ins",
    title: "Sign-ins",
    chartType: "bar",
    series: [
      { label: "Password", rows: signInsOf(s, "Password") },
      { label: "Google", rows: signInsOf(s, "Google") },
      { label: "Failed", rows: signInsOf(s, "Failed") },
    ],
  }),
  overTime({
    s,
    name: "get_new_accounts_metrics",
    id: "new_accounts",
    title: "New accounts",
    chartType: "bar",
    series: [
      {
        label: "New accounts",
        rows: `SELECT ${step(s, "n.account_day")} AS bucket, 1 AS total
                FROM ${s}.metrics_new_accounts(startDate, endDate) AS n`,
      },
    ],
  }),
];

// Rankings, drawn as bars: every page (there are about twenty), the 15 most
// used languages, the model types
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
        LIMIT 30
    ) AS pages;
    RETURN QUERY SELECT ${s}.metrics_chart('top_visited_pages', 'Most visited pages', 'ranking', 'page',
        'page', '["page"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

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
            LIMIT 15
        ) AS languages;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('top_languages', 'Most used languages (active projects)',
        'ranking', 'language', 'language', '["language"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

const modelsByType = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.get_models_by_type_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
    chart_rows JSON;
BEGIN
    IF to_regclass('${s}.model') IS NOT NULL THEN
        SELECT json_agg(json_build_object('type', model_type, 'count', total) ORDER BY total DESC, model_type)
        INTO chart_rows
        FROM (
            SELECT CASE m.engineering_type
                       WHEN 'domainEngineering' THEN 'Domain engineering'
                       WHEN 'applicationEngineering' THEN 'Application engineering'
                       WHEN 'scope' THEN 'Scope'
                       ELSE COALESCE(m.engineering_type, 'Unknown')
                   END AS model_type,
                   count(*) AS total
            FROM ${s}.model m
            WHERE NOT m.is_deleted
            GROUP BY 1
        ) AS types;
    END IF;
    RETURN QUERY SELECT ${s}.metrics_chart('models_by_type', 'Models by type', 'ranking', 'type',
        'type', '["type"]'::JSON, chart_rows);
END;
$$ LANGUAGE plpgsql STABLE;`;

// Every chart for one period, in the order of the page
const metricsOf = (s: string) => [
  `CREATE OR REPLACE FUNCTION ${s}.get_metrics(startDate DATE, endDate DATE)
RETURNS JSON AS $$
    SELECT json_agg(char_data) FROM (
        SELECT char_data FROM ${s}.get_overview_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_content_metrics()
        UNION ALL SELECT char_data FROM ${s}.get_visits_over_time_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_activity_over_time_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_top_visited_pages_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_top_languages_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_sign_ins_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_new_accounts_metrics(startDate, endDate)
        UNION ALL SELECT char_data FROM ${s}.get_models_by_type_metrics()
        UNION ALL SELECT char_data FROM ${s}.get_yearly_visits_metrics()
    ) AS charts;
$$ LANGUAGE sql STABLE;`,
  // Without a period, the last 30 days
  `CREATE OR REPLACE FUNCTION ${s}.get_metrics()
RETURNS JSON AS $$
    SELECT ${s}.get_metrics((current_date - 29)::DATE, current_date);
$$ LANGUAGE sql STABLE;`,
];

// Helpers before the charts that call them, get_metrics last
const usageOverviewStatements = (s: string): string[] => [
  bucket(s),
  buckets(s),
  visitorsByBucket(s),
  visitorTotal(s),
  returningShare(s),
  signIns(s),
  newAccounts(s),
  overview(s),
  content(s),
  ...overTimeCharts(s),
  topPages(s),
  topLanguages(s),
  modelsByType(s),
  ...metricsOf(s),
];

// No down step: 0018 and 0025 hold the former text of the replaced functions
export const usageOverview: SchemaMigration = {
  name: "0026-usage-overview",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0026-usage-overview: the schema name "${schema}" is not a plain name.`,
      );
    }
    await sequelize.transaction(async (transaction) => {
      for (const statement of usageOverviewStatements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0026-usage-overview: key figures, charts over time and rankings for one period",
    );
  },
};
