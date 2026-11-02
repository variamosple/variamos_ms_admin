-- Synthetic data of the EV-92 load test, for a disposable database only.
-- Run after the admin service has applied its migrations, with:
--   psql -v password=<throwaway password> -f seed.sql
-- No row comes from production: names, addresses and logs are generated.
\set ON_ERROR_STOP on
SET search_path = variamos, public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- 200 administrators, one per virtual user of admin-sessions.js. One hash for
-- all of them, at the cost the configuration gives (no rehash at sign-in).
WITH hash AS (
  SELECT crypt(:'password', gen_salt('bf', (
    SELECT value::int FROM configurations WHERE key = 'security.bcrypt_salt_rounds'
  ))) AS value
)
INSERT INTO "user" (id, "user", name, email, password, created_at)
SELECT 'load-admin-' || lpad(n::text, 3, '0'),
       'load-admin-' || lpad(n::text, 3, '0'),
       'Load Admin ' || n,
       'load-admin-' || lpad(n::text, 3, '0') || '@loadtest.invalid',
       hash.value,
       now() - interval '200 days'
  FROM generate_series(1, 200) AS n, hash;
INSERT INTO user_role (user_id, role_id)
SELECT id, (SELECT id FROM role WHERE name = 'Administrator')
  FROM "user" WHERE id LIKE 'load-admin-%'
ON CONFLICT DO NOTHING;

-- 3,000 ordinary accounts, for the list of users and the visits; the
-- insert_user_role trigger of the schema already gives them the default role
INSERT INTO "user" (id, "user", name, email, password, country_code, created_at, last_login)
SELECT 'load-user-' || n, 'load-user-' || n, 'Load User ' || n,
       'load-user-' || n || '@loadtest.invalid', NULL,
       (ARRAY['CO', 'FR', 'US', 'ES', 'MX', 'BR', 'CA', 'DE'])[1 + n % 8],
       now() - (n % 700) * interval '1 day',
       now() - (n % 60) * interval '1 day'
  FROM generate_series(1, 3000) AS n;

-- 30 days of health checks, every 30 s, for the eight monitored services:
-- 86,400 rows per service, the volume retained by OPT-02
INSERT INTO microservice_health_logs
       (service_name, status, response_time_ms, http_status_code, error_message, checked_at)
SELECT s.name,
       CASE WHEN random() < 0.995 THEN 'UP' ELSE 'DOWN' END,
       5 + floor(random() * 150)::int,
       200, NULL,
       now() - interval '30 days' + (t * interval '30 seconds') + interval '1 minute'
  FROM unnest(ARRAY['variamos_ms_admin', 'variamos_ms_languages', 'vms_projects',
                    'variamos_ms_notifications', 'semantic_translator',
                    'vms_domain_application', 'vms_requirements_autocomplete',
                    'variamos_ms_metrics']) AS s(name),
       generate_series(0, 86399) AS t;

-- 1,500 bugs, with notes and status changes. 1,200 are published on the
-- three repositories that up.sh gives as followed (GITHUB_MANAGED_REPOS): the
-- bug list shows only those; the other 300 stay in the local inbox.
INSERT INTO bugs (title, description, priority, category, status, reporter_email,
                  created_by_id, component, github_repo, git_issue_number,
                  github_creator, github_html_url, github_created_at,
                  created_at, updated_at)
SELECT 'Load bug ' || n,
       'Synthetic description of bug ' || n || ' for the load test.',
       (ARRAY['low', 'medium', 'high'])[1 + n % 3]::enum_bugs_priority,
       'bug',
       (ARRAY['pending', 'open', 'in_progress', 'resolved', 'closed', 'rejected'])[1 + n % 6],
       'load-user-' || (1 + n % 3000) || '@loadtest.invalid',
       'load-user-' || (1 + n % 3000),
       (ARRAY['language', 'model', 'microservice', 'admin', 'other'])[1 + n % 5],
       CASE WHEN n <= 1200 THEN 'loadtest/repo-' || (1 + n % 3) END,
       CASE WHEN n <= 1200 THEN n END,
       CASE WHEN n <= 1200 THEN 'variamos-bot' END,
       CASE WHEN n <= 1200 THEN 'https://github.invalid/loadtest/repo-' || (1 + n % 3) || '/issues/' || n END,
       CASE WHEN n <= 1200 THEN now() - (n % 365) * interval '1 day' END,
       now() - (n % 365) * interval '1 day',
       now() - (n % 30) * interval '1 day'
  FROM generate_series(1, 1500) AS n;
INSERT INTO bug_notes (bug_id, body, author_id)
SELECT id, 'Synthetic note ' || k, 'load-admin-001'
  FROM bugs, generate_series(1, 2) AS k WHERE title LIKE 'Load bug %';
INSERT INTO bug_status_logs (action, comment, bug_id, operator_id)
SELECT 'status_change', 'Synthetic change ' || k, id, 'load-admin-001'
  FROM bugs, generate_series(1, 3) AS k WHERE title LIKE 'Load bug %';

-- One year of page visits, about 300 a day, for the metrics dashboard
INSERT INTO page_visit (page_id, organization, user_id, visit_date, country_code)
SELECT (ARRAY['home', 'languages', 'models', 'projects', 'admin', 'docs'])[1 + n % 6],
       'NO_DATA',
       'load-user-' || (1 + n % 3000),
       current_date - (n % 365),
       (ARRAY['CO', 'FR', 'US', 'ES', 'MX', 'BR', 'CA', 'DE'])[1 + n % 8]
  FROM generate_series(1, 110000) AS n;

-- The charts read these summaries, not page_visit: filled here from the
-- generated visits
INSERT INTO visits_summary (page_id, unique_visits, visits, visits_date)
SELECT page_id, count(DISTINCT user_id), count(*), visit_date
  FROM page_visit GROUP BY page_id, visit_date;
-- Its primary key is (count, visit_year): two countries with the same count
-- in a year cannot both be stored, the second one is left out
INSERT INTO yearly_visits_summary (count, visit_year, country_code)
SELECT count(*), date_trunc('year', visit_date)::date, country_code
  FROM page_visit GROUP BY 2, 3
ON CONFLICT DO NOTHING;
INSERT INTO user_visit (user_id, country_code, visit_date)
SELECT DISTINCT user_id, country_code, visit_date FROM page_visit;

COMMIT;
ANALYZE;

SELECT 'users' AS data, count(*) FROM "user"
UNION ALL SELECT 'health logs', count(*) FROM microservice_health_logs
UNION ALL SELECT 'bugs', count(*) FROM bugs
UNION ALL SELECT 'page visits', count(*) FROM page_visit;
