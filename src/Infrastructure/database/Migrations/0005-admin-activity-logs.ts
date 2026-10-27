import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const ACTIVITY_LOG_TABLE = "admin_activity_logs";

// Kept one year (T-24, decision of 2026-10-23); a row may only be deleted
// once older, so that the purge works and nothing recent can be erased
const ACTIVITY_LOG_RETENTION = "1 year";

const table = (s: string) => `"${s}"."${ACTIVITY_LOG_TABLE}"`;
const guard = (s: string) => `"${s}"."admin_activity_logs_append_only"`;

const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS ${table(s)} (
    "id" bigserial NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actor_id" text,
    "action" character varying(64) NOT NULL,
    "entity_type" character varying(32) NOT NULL,
    "entity_id" character varying(255),
    "outcome" character varying(16) NOT NULL,
    "error_code" character varying(64),
    "before" jsonb,
    "after" jsonb,
    "transaction_id" character varying(64),
    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_activity_logs_outcome_check"
      CHECK ("outcome" IN ('success', 'failed'))
  )`,
  `CREATE INDEX IF NOT EXISTS "admin_activity_logs_occurred_at_idx"
     ON ${table(s)} ("occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "admin_activity_logs_entity_idx"
     ON ${table(s)} ("entity_type", "entity_id")`,
  `CREATE INDEX IF NOT EXISTS "admin_activity_logs_actor_idx"
     ON ${table(s)} ("actor_id")`,
  // Append-only: an update, a truncate or the deletion of a recent row fails
  `CREATE OR REPLACE FUNCTION ${guard(s)}() RETURNS trigger
     LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE'
        AND OLD."occurred_at" < now() - interval '${ACTIVITY_LOG_RETENTION}' THEN
       RETURN OLD;
     END IF;
     RAISE EXCEPTION 'The activity journal is append-only'
       USING ERRCODE = 'insufficient_privilege';
   END
   $$`,
  `DROP TRIGGER IF EXISTS "admin_activity_logs_no_change" ON ${table(s)}`,
  `CREATE TRIGGER "admin_activity_logs_no_change"
     BEFORE UPDATE OR DELETE ON ${table(s)}
     FOR EACH ROW EXECUTE FUNCTION ${guard(s)}()`,
  `DROP TRIGGER IF EXISTS "admin_activity_logs_no_truncate" ON ${table(s)}`,
  `CREATE TRIGGER "admin_activity_logs_no_truncate"
     BEFORE TRUNCATE ON ${table(s)}
     FOR EACH STATEMENT EXECUTE FUNCTION ${guard(s)}()`,
];

export const adminActivityLogs: SchemaMigration = {
  name: "0005-admin-activity-logs",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      `[MIGRATION] 0005-admin-activity-logs: table ${ACTIVITY_LOG_TABLE} ready, append-only`,
    );
  },
  down: async () => {
    // Reverting would erase the journal
    throw new Error("The activity journal migration cannot be reverted.");
  },
};
