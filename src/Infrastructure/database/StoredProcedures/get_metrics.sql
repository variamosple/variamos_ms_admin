CREATE OR REPLACE FUNCTION variamos.get_daily_unique_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
    daily_visits AS (
        SELECT page_id, unique_visits, visits, visits_date
        FROM variamos.visits_summary
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION variamos.get_daily_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
    daily_visits AS (
        SELECT page_id, unique_visits, visits, visits_date
        FROM variamos.visits_summary
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION variamos.get_monthly_visits_metrics(startDate DATE, endDate DATE)
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	monthly_visits AS (
        SELECT
            page_id,
            TO_CHAR(visits_date, 'YYYY-MM') AS month,	
            SUM(visits) AS total_visits
        FROM variamos.visits_summary
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
$$ LANGUAGE plpgsql;   

CREATE OR REPLACE FUNCTION variamos.get_top_visited_pages_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	top_visited_pages AS (
        SELECT
            page_id,
            SUM(visits) AS total_visits
        FROM variamos.visits_summary
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION variamos.get_yearly_visits_metrics()
RETURNS TABLE(char_data JSON) AS $$
DECLARE
BEGIN
    RETURN QUERY WITH
   	yearly_visits  AS (
        SELECT COALESCE(c.name, 'NO COUNTRY') as country_name
			,EXTRACT(YEAR FROM yvs.visit_year)::TEXT as visit_year
			,yvs.count AS visits_count
		FROM variamos.yearly_visits_summary yvs
		LEFT JOIN variamos.country AS c ON (c.code = yvs.country_code)
		WHERE yvs.visit_year = DATE_TRUNC('year', current_date) - INTERVAL '1 years'
		UNION ALL (
			SELECT COALESCE(c.name, 'NO COUNTRY') as country_name
				,EXTRACT(YEAR FROM uv.visit_date)::TEXT as visit_year
				,count(1) as visits_count 
			FROM variamos.user_visit AS uv
			LEFT JOIN variamos.country AS c ON (c.code = uv.country_code)
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION variamos.get_metrics()
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
        SELECT char_data FROM variamos.get_yearly_visits_metrics()
        UNION ALL
        SELECT char_data FROM variamos.get_daily_visits_metrics(dailyStartDate, dailyEndDate)
        UNION ALL
        SELECT char_data FROM variamos.get_daily_unique_visits_metrics(dailyStartDate, dailyEndDate)
        UNION ALL 
        SELECT char_data FROM variamos.get_monthly_visits_metrics(monthlyStartDate, dailyEndDate)
        UNION ALL 
        SELECT char_data FROM variamos.get_top_visited_pages_metrics()
    ) as data;
    
    RETURN metrics_data;
END;
$$ LANGUAGE plpgsql;