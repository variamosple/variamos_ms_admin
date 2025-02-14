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