import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

export const SESSION_TABLE = "admin_sessions";

// Values as of 2026-11-17 (EV-74 lot 2, EV-87 lot 4): usual durations, a
// little lenient, decided by the project lead. A migration never changes
// once applied, so they are written here rather than read from the code
export const SESSION_POLICY_ROWS = [
  {
    key: "security.session.idle_minutes",
    value: 60,
    description:
      "Minutes without any request of the platform's pages after which a session ends (5 to 1440).",
  },
  {
    key: "security.session.max_hours",
    value: 12,
    description:
      "Hours after the sign-in after which a session ends in any case (1 to 720).",
  },
];

const table = (s: string) => `"${s}"."${SESSION_TABLE}"`;

// No IF NOT EXISTS: a table of that name made by another service must stop
// the migration rather than be taken for this one (2026-11-11)
const statements = (s: string) => [
  `CREATE TABLE ${table(s)} (
    "id_hash" character(64) NOT NULL,
    "user_id" text NOT NULL,
    "started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id_hash")
  )`,
  `CREATE INDEX "admin_sessions_user_idx" ON ${table(s)} ("user_id")
     WHERE "revoked_at" IS NULL`,
  `CREATE INDEX "admin_sessions_started_at_idx" ON ${table(s)} ("started_at")`,
];

export const adminSessions: SchemaMigration = {
  name: "0033-admin-sessions",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const added: string[] = [];
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
      for (const row of SESSION_POLICY_ROWS) {
        // A key already there keeps the value an administrator gave it
        const inserted = await sequelize.query<{ key: string }>(
          `INSERT INTO "${schema}"."configurations"
             ("key", "value", "type", "category", "requires_mfa", "is_secret",
              "environment_scope", "is_read_only", "target_services",
              "description", "updated_by", "created_at", "updated_at")
           VALUES (:key, CAST(:value AS jsonb), 'number', 'security', false, false,
              'all', false, ARRAY['variamos_ms_admin']::varchar(50)[],
              :description, 'system_migration', now(), now())
           ON CONFLICT ("key") DO NOTHING
           RETURNING "key"`,
          {
            replacements: { ...row, value: JSON.stringify(row.value) },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        added.push(...inserted.map((r) => r.key));
      }
    });
    logger.info(
      `[MIGRATION] 0033-admin-sessions: table ${SESSION_TABLE} ready; ${added.length} session key(s) added (${added.join(", ") || "none"})`,
    );
  },
  // Reverting would reopen the sessions that were ended
  down: refuseRollback("session registry"),
};
