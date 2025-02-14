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