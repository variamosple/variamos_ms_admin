-- Structure of the admin module tables in production, read on 2026-10-18
-- (pg_dump --schema-only, no data). The schema name is replaced by the tests.
-- The enum type and the bug_* sequences are not part of a per-table dump:
-- they come from tests/db/VariamosDB.sql. "user" is reduced to its key.
CREATE TYPE variamos.enum_bugs_priority AS ENUM ('low', 'medium', 'high');
CREATE SEQUENCE variamos.bug_attachments_id_seq AS integer;
CREATE SEQUENCE variamos.bug_notes_id_seq AS integer;
CREATE SEQUENCE variamos.bug_status_logs_id_seq AS integer;
CREATE TABLE variamos."user" (
    id text NOT NULL
);
CREATE TABLE variamos.bug_attachments (
    id integer DEFAULT nextval('variamos.bug_attachments_id_seq'::regclass) NOT NULL,
    file_path text NOT NULL,
    file_type text NOT NULL,
    bug_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE variamos.bug_notes (
    id integer DEFAULT nextval('variamos.bug_notes_id_seq'::regclass) NOT NULL,
    bug_id uuid NOT NULL,
    body text NOT NULL,
    author_id text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE variamos.bug_status_logs (
    id integer DEFAULT nextval('variamos.bug_status_logs_id_seq'::regclass) NOT NULL,
    action text NOT NULL,
    comment text,
    bug_id uuid NOT NULL,
    operator_id text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE variamos.bugs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    priority variamos.enum_bugs_priority DEFAULT 'medium'::variamos.enum_bugs_priority NOT NULL,
    category text,
    status text DEFAULT 'pending'::text NOT NULL,
    reporter_email text,
    created_by_id text,
    github_repo text,
    git_issue_number integer,
    github_creator text,
    github_html_url text,
    github_assignee text,
    github_created_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE variamos.configurations (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    type character varying(30) NOT NULL,
    category character varying(50) NOT NULL,
    requires_mfa boolean DEFAULT false,
    is_secret boolean DEFAULT false,
    environment_scope character varying(20) DEFAULT 'all'::character varying,
    is_read_only boolean DEFAULT false,
    target_services character varying(50)[] NOT NULL,
    description text,
    updated_by character varying(100),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
CREATE SEQUENCE variamos.configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE variamos.configurations_id_seq OWNED BY variamos.configurations.id;
CREATE TABLE variamos.microservice_audit_logs (
    id bigint NOT NULL,
    service_name character varying(100) NOT NULL,
    action_type character varying(50) NOT NULL,
    details jsonb NOT NULL,
    performed_by character varying(100) NOT NULL,
    created_at timestamp with time zone NOT NULL
);
CREATE SEQUENCE variamos.microservice_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE variamos.microservice_audit_logs_id_seq OWNED BY variamos.microservice_audit_logs.id;
CREATE TABLE variamos.microservice_daily_stats (
    id bigint NOT NULL,
    service_name character varying(100) NOT NULL,
    stat_date date NOT NULL,
    uptime_percentage numeric(5,2) NOT NULL,
    avg_latency_ms integer NOT NULL,
    total_checks integer NOT NULL,
    successful_checks integer NOT NULL,
    degraded_checks integer NOT NULL,
    failed_checks integer NOT NULL,
    created_at timestamp without time zone
);
CREATE SEQUENCE variamos.microservice_daily_stats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE variamos.microservice_daily_stats_id_seq OWNED BY variamos.microservice_daily_stats.id;
CREATE TABLE variamos.microservice_health_logs (
    id bigint NOT NULL,
    service_name character varying(100) NOT NULL,
    status character varying(20) NOT NULL,
    response_time_ms integer NOT NULL,
    http_status_code integer,
    error_message text,
    checked_at timestamp with time zone NOT NULL
);
CREATE SEQUENCE variamos.microservice_health_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE variamos.microservice_health_logs_id_seq OWNED BY variamos.microservice_health_logs.id;
CREATE TABLE variamos.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE ONLY variamos.configurations ALTER COLUMN id SET DEFAULT nextval('variamos.configurations_id_seq'::regclass);
ALTER TABLE ONLY variamos.microservice_audit_logs ALTER COLUMN id SET DEFAULT nextval('variamos.microservice_audit_logs_id_seq'::regclass);
ALTER TABLE ONLY variamos.microservice_daily_stats ALTER COLUMN id SET DEFAULT nextval('variamos.microservice_daily_stats_id_seq'::regclass);
ALTER TABLE ONLY variamos.microservice_health_logs ALTER COLUMN id SET DEFAULT nextval('variamos.microservice_health_logs_id_seq'::regclass);
ALTER TABLE ONLY variamos."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.bug_attachments
    ADD CONSTRAINT bug_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.bug_notes
    ADD CONSTRAINT bug_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.bug_status_logs
    ADD CONSTRAINT bug_status_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.bugs
    ADD CONSTRAINT bugs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.configurations
    ADD CONSTRAINT configurations_key_key UNIQUE (key);
ALTER TABLE ONLY variamos.configurations
    ADD CONSTRAINT configurations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.microservice_audit_logs
    ADD CONSTRAINT microservice_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.microservice_daily_stats
    ADD CONSTRAINT microservice_daily_stats_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.microservice_health_logs
    ADD CONSTRAINT microservice_health_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY variamos.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);
CREATE INDEX idx_configurations_category ON variamos.configurations USING btree (category);
CREATE INDEX idx_configurations_env ON variamos.configurations USING btree (environment_scope);
CREATE INDEX idx_configurations_key ON variamos.configurations USING btree (key);
CREATE INDEX idx_password_reset_tokens_hash ON variamos.password_reset_tokens USING btree (token_hash);
ALTER TABLE ONLY variamos.bug_attachments
    ADD CONSTRAINT fk_bug_attachments_bug FOREIGN KEY (bug_id) REFERENCES variamos.bugs(id) ON DELETE CASCADE;
ALTER TABLE ONLY variamos.bug_notes
    ADD CONSTRAINT fk_bug_notes_author FOREIGN KEY (author_id) REFERENCES variamos."user"(id) ON DELETE SET NULL;
ALTER TABLE ONLY variamos.bug_notes
    ADD CONSTRAINT fk_bug_notes_bug FOREIGN KEY (bug_id) REFERENCES variamos.bugs(id) ON DELETE CASCADE;
ALTER TABLE ONLY variamos.bug_status_logs
    ADD CONSTRAINT fk_bug_status_logs_bug FOREIGN KEY (bug_id) REFERENCES variamos.bugs(id) ON DELETE CASCADE;
ALTER TABLE ONLY variamos.bug_status_logs
    ADD CONSTRAINT fk_bug_status_logs_operator FOREIGN KEY (operator_id) REFERENCES variamos."user"(id) ON DELETE SET NULL;
ALTER TABLE ONLY variamos.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES variamos."user"(id) ON DELETE CASCADE;
