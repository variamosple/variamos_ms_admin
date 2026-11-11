import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const GOOGLE_IDENTITY_TABLE = "user_google_identity";

// The Google account of each account that signs in through Google (EV-70
// lot 5): Google's "sub", unique among all Google accounts and never reused,
// is the key, so that a changed address keeps opening the same account.
// One Google account per account; the link goes with the account.
const statement = (s: string) =>
  `CREATE TABLE IF NOT EXISTS "${s}"."${GOOGLE_IDENTITY_TABLE}" (
    "google_sub" character varying(255) NOT NULL,
    "user_id" text NOT NULL,
    "linked_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_google_identity_pkey" PRIMARY KEY ("google_sub"),
    CONSTRAINT "user_google_identity_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "user_google_identity_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`;

export const googleIdentity: SchemaMigration = {
  name: "0017-google-identity",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(statement(schema));
    logger.info(
      `[MIGRATION] 0017-google-identity: table ${GOOGLE_IDENTITY_TABLE} ready`,
    );
  },
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(
      `DROP TABLE IF EXISTS "${schema}"."${GOOGLE_IDENTITY_TABLE}"`,
    );
  },
};
