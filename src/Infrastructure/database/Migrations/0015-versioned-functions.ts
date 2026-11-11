import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// The SQL functions of the module, until now created by hand in production
// (EV-90). Their text is the one production ran on 2026-11-10, schema name
// aside: the six statistics functions of the dashboard (same fingerprint as
// the former get_metrics.sql), and the sign-up trigger that gives every new
// account the roles 2 (Language developer) and 3 (Product line designer).
// CREATE OR REPLACE leaves production as it was, and gives a new database
// the same functions.

// Written without quotes, as production has it: a plain schema name only
const PLAIN_SCHEMA = /^[a-z_][a-z0-9_]*$/;

export const METRICS_FUNCTIONS = [
  "get_daily_unique_visits_metrics",
  "get_daily_visits_metrics",
  "get_monthly_visits_metrics",
  "get_top_visited_pages_metrics",
  "get_yearly_visits_metrics",
  "get_metrics",
] as const;

// get_metrics() calls the five others: it comes last
const metricsStatements: ((s: string) => string)[] = [
  // get_daily_unique_visits_metrics
  (
    s: string,
  ) => `CREATE OR REPLACE FUNCTION ${s}.get_daily_unique_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
    daily_visits AS (
        SELECT page_id, unique_visits, visits, visits_date
        FROM ${s}.visits_summary
		WHERE visits_date BETWEEN startDate AND endDate
        ORDER BY visits_date, page_id ASC
    )
    SELECT json_build_object(
		'id', id,
		'title', title,
		'chartType', chart_type,
		'defaultFilter', default_filter,
		'labelKey', label_key,
		'filters', filters,
		'data', data
	)
	FROM (
		SELECT
		'daily_unique_visits' AS id,
		'Daily Unique Visits' AS title,
		'line' AS chart_type,
		'date' as label_key,
		'page' AS default_filter,
		'["page"]'::json AS filters,
		(
			SELECT json_agg(json_build_object('page', page_id, 'count', unique_visits, 'date', visits_date))
			FROM daily_visits
		) AS data
	) AS chart_data;

END;
$$ LANGUAGE plpgsql;`,
  // get_daily_visits_metrics
  (
    s: string,
  ) => `CREATE OR REPLACE FUNCTION ${s}.get_daily_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
    daily_visits AS (
        SELECT page_id, unique_visits, visits, visits_date
        FROM ${s}.visits_summary
        WHERE visits_date BETWEEN startDate AND endDate
        ORDER BY visits_date, page_id ASC
    )
    SELECT json_build_object(
        'id', id,
		'title', title,
		'chartType', chart_type,
		'defaultFilter', default_filter,
		'labelKey', label_key,
		'filters', filters,
		'data', data
	)
	FROM (
		SELECT 
        'daily_visits' AS id,
		'Daily Visits' AS title,
		'line' AS chart_type,
		'date' as label_key,
		'page' AS default_filter,
		'["page"]'::json AS filters,
		(
			SELECT json_agg(json_build_object('page', page_id, 'count', visits, 'date', visits_date))
			FROM daily_visits
		) AS data
	) AS chart_data;

END;
$$ LANGUAGE plpgsql;`,
  // get_monthly_visits_metrics
  (
    s: string,
  ) => `CREATE OR REPLACE FUNCTION ${s}.get_monthly_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	monthly_visits AS (
        SELECT
            page_id,
            TO_CHAR(visits_date, 'YYYY-MM') AS month,	
            SUM(visits) AS total_visits
        FROM ${s}.visits_summary
		WHERE visits_date BETWEEN startDate AND endDate
        GROUP BY page_id, month
        ORDER BY page_id, month
    )
    SELECT json_build_object(
		'id', id,
		'title', title,
		'chartType', chart_type,
		'defaultFilter', default_filter,
		'labelKey', label_key,
		'filters', filters,
		'data', data
	)
	FROM (
		SELECT 
		'monthly_visits' AS id,
		'Monthly Visits' AS title,
		'line' AS chart_type,
		'date' as label_key,
		'page' AS default_filter,
		'["page"]'::json AS filters,
		(
			SELECT json_agg(json_build_object('page', page_id, 'count', total_visits, 'date', month))
			FROM monthly_visits
		) AS data
	) AS chart_data;

END;
$$ LANGUAGE plpgsql;   `,
  // get_top_visited_pages_metrics
  (
    s: string,
  ) => `CREATE OR REPLACE FUNCTION ${s}.get_top_visited_pages_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	top_visited_pages AS (
        SELECT
            page_id,
            SUM(visits) AS total_visits
        FROM ${s}.visits_summary
        WHERE visits_date > current_date - INTERVAL '3 months'
        GROUP BY page_id
        ORDER BY total_visits DESC, page_id
		LIMIT 10
    )
    SELECT json_build_object(
		'id', id,
		'title', title,
		'chartType', chart_type,
		'defaultFilter', default_filter,
		'labelKey', label_key,
		'filters', filters,
		'data', data
	)
	FROM (
		SELECT 
		'top_visited_pages' AS id,
		'Top visited pages (Last 3 Months)' AS title,
		'doughnut' AS chart_type,
		'page' as label_key,
		'page' AS default_filter,
		'["page"]'::json AS filters,
		(
			SELECT json_agg(json_build_object('page', page_id, 'count', total_visits))
			FROM top_visited_pages
		) AS data
	) AS chart_data;

END;
$$ LANGUAGE plpgsql;`,
  // get_yearly_visits_metrics
  (s: string) => `CREATE OR REPLACE FUNCTION ${s}.get_yearly_visits_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	yearly_visits  AS (
        SELECT COALESCE(c.name, 'NO COUNTRY') as country_name
			,EXTRACT(YEAR FROM yvs.visit_year)::TEXT as visit_year
			,yvs.count AS visits_count
		FROM ${s}.yearly_visits_summary yvs
		LEFT JOIN ${s}.country AS c ON (c.code = yvs.country_code)
		WHERE yvs.visit_year = DATE_TRUNC('year', current_date) - INTERVAL '1 years'
		UNION ALL (
			SELECT COALESCE(c.name, 'NO COUNTRY') as country_name
				,EXTRACT(YEAR FROM uv.visit_date)::TEXT as visit_year
				,count(1) as visits_count 
			FROM ${s}.user_visit AS uv
			LEFT JOIN ${s}.country AS c ON (c.code = uv.country_code)
			GROUP BY c.name, uv.visit_date
			ORDER BY uv.visit_date DESC , c.name ASC
		)
    )
    SELECT json_build_object(
		'id', id,
		'title', title,
		'chartType', chart_type,
		'defaultFilter', default_filter,
		'labelKey', label_key,
		'filters', filters,
		'data', data
	)
	FROM (
		SELECT 
		'yearly_visits' AS id,
		'Yearly visits' AS title,
		'geo' AS chart_type,
		'Country' as label_key,
		EXTRACT(YEAR FROM CURRENT_DATE)::TEXT AS default_filter,
		NULL AS filters,
		json_object_agg(visit_year, data_array) AS data
		FROM (
			SELECT 
				visit_year,
				array_agg(json_build_array(country_name, visits_count)) AS data_array
			FROM yearly_visits
			GROUP BY visit_year
		) AS metric_data
	) AS chart_data;

END;
$$ LANGUAGE plpgsql;`,
  // get_metrics
  (s: string) => `CREATE OR REPLACE FUNCTION ${s}.get_metrics()
RETURNS JSON AS $$
DECLARE
    metrics_data JSON;
    dailyStartDate DATE := current_date - INTERVAL '3 months';
    dailyEndDate DATE := current_date;
    monthlyStartDate DATE := current_date - INTERVAL '24 months';
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
    ) as data;
    
    RETURN metrics_data;
END;
$$ LANGUAGE plpgsql;`,
];

export const SIGN_UP_TRIGGER = "after_insert_user";
export const SIGN_UP_DEFAULT_ROLE_IDS = [2, 3] as const;

const signUpFunction = (
  s: string,
) => `CREATE OR REPLACE FUNCTION ${s}.insert_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO ${s}.user_role (user_id, role_id) VALUES (NEW.id, 2);
        INSERT INTO ${s}.user_role (user_id, role_id) VALUES (NEW.id, 3);

    RETURN NEW;
END;
$function$`;

const signUpTrigger = (s: string) =>
  `CREATE OR REPLACE TRIGGER ${SIGN_UP_TRIGGER} AFTER INSERT ON ${s}."user" FOR EACH ROW EXECUTE FUNCTION ${s}.insert_user_role()`;

// No down step: these functions existed before this migration, and the
// dashboard and the sign-up depend on them
export const versionedFunctions: SchemaMigration = {
  name: "0015-versioned-functions",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    if (!PLAIN_SCHEMA.test(schema)) {
      throw new Error(
        `0015-versioned-functions: the schema name "${schema}" is not a plain name.`,
      );
    }
    const trigger = await sequelize.transaction(async (transaction) => {
      for (const statement of metricsStatements) {
        await sequelize.query(statement(schema), { transaction });
      }
      // The trigger writes to the shared user_role table
      const [row] = await sequelize.query<{ exists: boolean }>(
        "SELECT to_regclass(:table) IS NOT NULL AS exists",
        {
          replacements: { table: `"${schema}"."user_role"` },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      if (!row?.exists) return false;
      await sequelize.query(signUpFunction(schema), { transaction });
      await sequelize.query(signUpTrigger(schema), { transaction });
      return true;
    });
    if (trigger) {
      logger.info(
        "[MIGRATION] 0015-versioned-functions: statistics functions and sign-up trigger in place",
      );
    } else {
      logger.warn(
        "[MIGRATION] 0015-versioned-functions: statistics functions in place; no user_role table, so no sign-up trigger",
      );
    }
  },
};
