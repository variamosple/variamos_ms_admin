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