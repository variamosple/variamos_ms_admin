import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const SCHEDULED_CHANGES_TABLE = "scheduled_configuration_changes";

// Changes of the settings users notice, planned for a later date (EV-115
// lot B). One planned change per setting at a time (partial unique index);
// a resolved change stays as a record of what happened to it.
const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS "${s}"."${SCHEDULED_CHANGES_TABLE}" (
    "id" serial NOT NULL,
    "config_key" character varying(100) NOT NULL,
    "previous_value" jsonb NOT NULL,
    "new_value" jsonb NOT NULL,
    "base_updated_at" timestamp with time zone,
    "due_at" timestamp with time zone NOT NULL,
    "status" character varying(20) DEFAULT 'scheduled' NOT NULL,
    "reason" text,
    "created_by" character varying(100) NOT NULL,
    "updated_by" character varying(100),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "scheduled_configuration_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scheduled_configuration_changes_status_check" CHECK (
      "status" IN ('scheduled', 'applied', 'cancelled', 'conflict', 'refused')
    ),
    CONSTRAINT "scheduled_configuration_changes_config_key_fkey"
      FOREIGN KEY ("config_key") REFERENCES "${s}"."configurations" ("key")
      ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_configuration_changes_one_planned"
    ON "${s}"."${SCHEDULED_CHANGES_TABLE}" ("config_key")
    WHERE "status" = 'scheduled'`,
  `CREATE INDEX IF NOT EXISTS "scheduled_configuration_changes_due"
    ON "${s}"."${SCHEDULED_CHANGES_TABLE}" ("due_at")
    WHERE "status" = 'scheduled'`,
];

export const scheduledConfigurationChanges: SchemaMigration = {
  name: "0019-scheduled-configuration-changes",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    for (const statement of statements(schema)) {
      await sequelize.query(statement);
    }
    logger.info(
      `[MIGRATION] 0019-scheduled-configuration-changes: table ${SCHEDULED_CHANGES_TABLE} ready`,
    );
  },
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(
      `DROP TABLE IF EXISTS "${schema}"."${SCHEDULED_CHANGES_TABLE}"`,
    );
  },
};
