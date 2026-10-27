import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const ACCESS_LOG_TABLE = "admin_access_logs";

// Kept six months (T-24, decision of 2026-10-23): the address and the
// account are personal data. Only rows older than that may be deleted.
const ACCESS_LOG_RETENTION = "6 months";

const table = (s: string) => `"${s}"."${ACCESS_LOG_TABLE}"`;
const guard = (s: string) => `"${s}"."admin_access_logs_append_only"`;

const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS ${table(s)} (
    "id" bigserial NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "event" character varying(32) NOT NULL,
    "outcome" character varying(16) NOT NULL,
    "reason" character varying(64),
    "user_id" text,
    "ip" character varying(64),
    "method" character varying(8),
    "path" character varying(255),
    "status_code" smallint,
    CONSTRAINT "admin_access_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_access_logs_outcome_check"
      CHECK ("outcome" IN ('success', 'failed'))
  )`,
  `CREATE INDEX IF NOT EXISTS "admin_access_logs_occurred_at_idx"
     ON ${table(s)} ("occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "admin_access_logs_user_idx"
     ON ${table(s)} ("user_id", "occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "admin_access_logs_ip_idx"
     ON ${table(s)} ("ip", "occurred_at")`,
  // Append-only: an update, a truncate or the deletion of a recent row fails
  `CREATE OR REPLACE FUNCTION ${guard(s)}() RETURNS trigger
     LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE'
        AND OLD."occurred_at" < now() - interval '${ACCESS_LOG_RETENTION}' THEN
       RETURN OLD;
     END IF;
     RAISE EXCEPTION 'The access journal is append-only'
       USING ERRCODE = 'insufficient_privilege';
   END
   $$`,
  `DROP TRIGGER IF EXISTS "admin_access_logs_no_change" ON ${table(s)}`,
  `CREATE TRIGGER "admin_access_logs_no_change"
     BEFORE UPDATE OR DELETE ON ${table(s)}
     FOR EACH ROW EXECUTE FUNCTION ${guard(s)}()`,
  `DROP TRIGGER IF EXISTS "admin_access_logs_no_truncate" ON ${table(s)}`,
  `CREATE TRIGGER "admin_access_logs_no_truncate"
     BEFORE TRUNCATE ON ${table(s)}
     FOR EACH STATEMENT EXECUTE FUNCTION ${guard(s)}()`,
];

export const adminAccessLogs: SchemaMigration = {
  name: "0006-admin-access-logs",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      `[MIGRATION] 0006-admin-access-logs: table ${ACCESS_LOG_TABLE} ready, append-only`,
    );
  },
  down: async () => {
    // Reverting would erase the journal
    throw new Error("The access journal migration cannot be reverted.");
  },
};
