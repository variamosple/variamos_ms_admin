import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const USER_PREFERENCES_TABLE = "user_preferences";

// What each account chose for its display (EV-115 lot C), beside the shared
// "user" table rather than in it: a time zone now, the language of the site
// later. The row goes with the account.
const statement = (s: string) =>
  `CREATE TABLE IF NOT EXISTS "${s}"."${USER_PREFERENCES_TABLE}" (
    "user_id" text NOT NULL,
    "time_zone" character varying(64),
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`;

export const userPreferences: SchemaMigration = {
  name: "0020-user-preferences",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(statement(schema));
    logger.info(
      `[MIGRATION] 0020-user-preferences: table ${USER_PREFERENCES_TABLE} ready`,
    );
  },
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(
      `DROP TABLE IF EXISTS "${schema}"."${USER_PREFERENCES_TABLE}"`,
    );
  },
};
