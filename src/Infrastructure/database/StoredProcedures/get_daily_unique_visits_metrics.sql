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