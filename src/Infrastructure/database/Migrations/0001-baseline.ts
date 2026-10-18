import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

interface BaselineTable {
  name: string;
  statements: (schema: string) => string[];
}

const seq = (schema: string, name: string) =>
  `'"${schema}"."${name}"'::regclass`;

// The module tables as production holds them (schema read on 2026-10-18,
// T-07). A table that already exists is not touched at all: no column,
// index or constraint is changed.
export const BASELINE_TABLES: BaselineTable[] = [
  {
    name: "bugs",
    statements: (s) => [
      `DO $$ BEGIN
         CREATE TYPE "${s}"."enum_bugs_priority" AS ENUM ('low', 'medium', 'high');
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
      `CREATE TABLE "${s}"."bugs" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "priority" "${s}"."enum_bugs_priority" DEFAULT 'medium' NOT NULL,
        "category" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "reporter_email" text,
        "created_by_id" text,
        "github_repo" text,
        "git_issue_number" integer,
        "github_creator" text,
        "github_html_url" text,
        "github_assignee" text,
        "github_created_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "bugs_pkey" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    name: "bug_attachments",
    statements: (s) => [
      `CREATE SEQUENCE IF NOT EXISTS "${s}"."bug_attachments_id_seq" AS integer`,
      `CREATE TABLE "${s}"."bug_attachments" (
        "id" integer DEFAULT nextval(${seq(s, "bug_attachments_id_seq")}) NOT NULL,
        "file_path" text NOT NULL,
        "file_type" text NOT NULL,
        "bug_id" uuid NOT NULL,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bug_attachments_bug" FOREIGN KEY ("bug_id")
          REFERENCES "${s}"."bugs" ("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    name: "bug_status_logs",
    statements: (s) => [
      `CREATE SEQUENCE IF NOT EXISTS "${s}"."bug_status_logs_id_seq" AS integer`,
      `CREATE TABLE "${s}"."bug_status_logs" (
        "id" integer DEFAULT nextval(${seq(s, "bug_status_logs_id_seq")}) NOT NULL,
        "action" text NOT NULL,
        "comment" text,
        "bug_id" uuid NOT NULL,
        "operator_id" text,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "bug_status_logs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bug_status_logs_bug" FOREIGN KEY ("bug_id")
          REFERENCES "${s}"."bugs" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_bug_status_logs_operator" FOREIGN KEY ("operator_id")
          REFERENCES "${s}"."user" ("id") ON DELETE SET NULL
      )`,
    ],
  },
  {
    name: "bug_notes",
    statements: (s) => [
      `CREATE SEQUENCE IF NOT EXISTS "${s}"."bug_notes_id_seq" AS integer`,
      `CREATE TABLE "${s}"."bug_notes" (
        "id" integer DEFAULT nextval(${seq(s, "bug_notes_id_seq")}) NOT NULL,
        "bug_id" uuid NOT NULL,
        "body" text NOT NULL,
        "author_id" text,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "bug_notes_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bug_notes_bug" FOREIGN KEY ("bug_id")
          REFERENCES "${s}"."bugs" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_bug_notes_author" FOREIGN KEY ("author_id")
          REFERENCES "${s}"."user" ("id") ON DELETE SET NULL
      )`,
    ],
  },
  {
    name: "configurations",
    statements: (s) => [
      `CREATE TABLE "${s}"."configurations" (
        "id" serial NOT NULL,
        "key" character varying(100) NOT NULL,
        "value" jsonb NOT NULL,
        "type" character varying(30) NOT NULL,
        "category" character varying(50) NOT NULL,
        "requires_mfa" boolean DEFAULT false,
        "is_secret" boolean DEFAULT false,
        "environment_scope" character varying(20) DEFAULT 'all',
        "is_read_only" boolean DEFAULT false,
        "target_services" character varying(50)[] NOT NULL,
        "description" text,
        "updated_by" character varying(100),
        "created_at" timestamp with time zone NOT NULL,
        "updated_at" timestamp with time zone NOT NULL,
        CONSTRAINT "configurations_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "configurations_key_key" UNIQUE ("key")
      )`,
      `CREATE INDEX "idx_configurations_category" ON "${s}"."configurations" ("category")`,
      `CREATE INDEX "idx_configurations_env" ON "${s}"."configurations" ("environment_scope")`,
      `CREATE INDEX "idx_configurations_key" ON "${s}"."configurations" ("key")`,
    ],
  },
  {
    name: "password_reset_tokens",
    statements: (s) => [
      `CREATE TABLE "${s}"."password_reset_tokens" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "user_id" text NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" timestamp without time zone NOT NULL,
        "used_at" timestamp without time zone,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash"),
        CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id")
          REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
      )`,
      `CREATE INDEX "idx_password_reset_tokens_hash" ON "${s}"."password_reset_tokens" ("token_hash")`,
    ],
  },
  {
    name: "microservice_health_logs",
    statements: (s) => [
      `CREATE TABLE "${s}"."microservice_health_logs" (
        "id" bigserial NOT NULL,
        "service_name" character varying(100) NOT NULL,
        "status" character varying(20) NOT NULL,
        "response_time_ms" integer NOT NULL,
        "http_status_code" integer,
        "error_message" text,
        "checked_at" timestamp with time zone NOT NULL,
        CONSTRAINT "microservice_health_logs_pkey" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    name: "microservice_daily_stats",
    statements: (s) => [
      `CREATE TABLE "${s}"."microservice_daily_stats" (
        "id" bigserial NOT NULL,
        "service_name" character varying(100) NOT NULL,
        "stat_date" date NOT NULL,
        "uptime_percentage" numeric(5,2) NOT NULL,
        "avg_latency_ms" integer NOT NULL,
        "total_checks" integer NOT NULL,
        "successful_checks" integer NOT NULL,
        "degraded_checks" integer NOT NULL,
        "failed_checks" integer NOT NULL,
        "created_at" timestamp without time zone,
        CONSTRAINT "microservice_daily_stats_pkey" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    name: "microservice_audit_logs",
    statements: (s) => [
      `CREATE TABLE "${s}"."microservice_audit_logs" (
        "id" bigserial NOT NULL,
        "service_name" character varying(100) NOT NULL,
        "action_type" character varying(50) NOT NULL,
        "details" jsonb NOT NULL,
        "performed_by" character varying(100) NOT NULL,
        "created_at" timestamp with time zone NOT NULL,
        CONSTRAINT "microservice_audit_logs_pkey" PRIMARY KEY ("id")
      )`,
    ],
  },
];

export const baseline: SchemaMigration = {
  name: "0001-baseline",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const created: string[] = [];
    await sequelize.transaction(async (transaction) => {
      for (const table of BASELINE_TABLES) {
        const [row] = await sequelize.query<{ exists: boolean }>(
          "SELECT to_regclass(:name) IS NOT NULL AS exists",
          {
            replacements: { name: `"${schema}"."${table.name}"` },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        if (row?.exists) {
          continue;
        }
        for (const statement of table.statements(schema)) {
          await sequelize.query(statement, { transaction });
        }
        created.push(table.name);
      }
    });
    logger.info(
      `[MIGRATION] 0001-baseline: ${created.length} table(s) created (${created.join(", ") || "none"}), ${BASELINE_TABLES.length - created.length} already present and left untouched`,
    );
  },
  down: async () => {
    // Reverting would drop the tables and the data they hold
    throw new Error("The baseline migration cannot be reverted.");
  },
};
