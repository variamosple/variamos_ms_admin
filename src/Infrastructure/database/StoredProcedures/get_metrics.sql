CREATE OR REPLACE FUNCTION variamos.get_metrics()
RETURNS JSON AS $$
DECLARE
    metrics_data JSON;
BEGIN
    WITH
    daily_visits AS (
        SELECT page_id, unique_visits, visits, visits_date
        FROM variamos.visits_summary
        WHERE visits_date > current_date - INTERVAL '3 months'
        ORDER BY visits_date, page_id ASC
    ),
    monthly_visits AS (
        SELECT
            page_id,
            TO_CHAR(visits_date, 'YYYY-MM') AS month,	
            SUM(visits) AS total_visits
        FROM variamos.visits_summary
        WHERE visits_date > current_date - INTERVAL '24 months'
        GROUP BY page_id, month
        ORDER BY page_id, month
    ),
    top_visited_pages AS (
        SELECT
            page_id,
            SUM(visits) AS total_visits
        FROM variamos.visits_summary
        WHERE visits_date > current_date - INTERVAL '3 months'
        GROUP BY page_id
        ORDER BY total_visits DESC, page_id
		LIMIT 10
    ),
    yearly_visits  AS (
        SELECT COALESCE(c.name, 'NO COUNTRY') as country_name
			,EXTRACT(YEAR FROM yvs.visit_year)::TEXT as visit_year
			,yvs.count AS visits_count
		FROM variamos.yearly_visits_summary yvs
		LEFT JOIN variamos.country AS c ON (c.code = yvs.country_code)
		WHERE yvs.visit_year = DATE_TRUNC('year', current_date) - INTERVAL '1 years'
		UNION ALL (
			SELECT COALESCE(c.name, 'NO COUNTRY') as country_code
				,EXTRACT(YEAR FROM uv.visit_date)::TEXT as visit_year
				,count(1) as visits_count 
			FROM variamos.user_visit AS uv
			LEFT JOIN variamos.country AS c ON (c.code = uv.country_code)
			GROUP BY c.name, uv.visit_date
			ORDER BY uv.visit_date DESC , c.name ASC
		)
    )
    SELECT json_agg(
        json_build_object(
            'title', title,
            'chartType', chart_type,
            'defaultFilter', default_filter,
            'labelKey', label_key,
            'filters', filters,
            'data', data
        )
    )
    INTO metrics_data
    FROM (
        (
            SELECT 
            'Daily Unique Visits' AS title,
            'line' AS chart_type,
            'date' as label_key,
            'page' AS default_filter,
            '["page"]'::json AS filters,
            (
                SELECT json_agg(json_build_object('page', page_id, 'count', unique_visits, 'date', visits_date))
                FROM daily_visits
            ) AS data
        )
        UNION ALL
        (
            SELECT 
            'Daily Visits' AS title,
            'line' AS chart_type,
            'date' as label_key,
            'page' AS default_filter,
            '["page"]'::json AS filters,
            (
                SELECT json_agg(json_build_object('page', page_id, 'count', visits, 'date', visits_date))
                FROM daily_visits
            ) AS data
        )
        UNION ALL
        (
            SELECT 
            'Monthly Visits' AS title,
            'line' AS chart_type,
            'date' as label_key,
            'page' AS default_filter,
            '["page"]'::json AS filters,
            (
                SELECT json_agg(json_build_object('page', page_id, 'count', total_visits, 'date', month))
                FROM monthly_visits
            ) AS data
        )
        UNION ALL
        (
            SELECT 
            'Top visited pagest (Last 3 Months)' AS title,
            'doughnut' AS chart_type,
            'page' as label_key,
            'page' AS default_filter,
            '["page"]'::json AS filters,
            (
                SELECT json_agg(json_build_object('page', page_id, 'count', total_visits))
                FROM top_visited_pages
            ) AS data
        )
        UNION ALL
        (
            SELECT 
            'Yearly visits' AS title,
            'geo' AS chart_type,
            'Country' as label_key,
            EXTRACT(YEAR FROM CURRENT_DATE)::TEXT AS default_filter,
            NULL AS filters,
            (
                SELECT json_build_object(visit_year, array_agg(json_build_array(country_name, visits_count)))
                FROM yearly_visits
                GROUP BY visit_year
            ) AS data
        )
    );
    
    RETURN metrics_data;
END;
$$ LANGUAGE plpgsql;