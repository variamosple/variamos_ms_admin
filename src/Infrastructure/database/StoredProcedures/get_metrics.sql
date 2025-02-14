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