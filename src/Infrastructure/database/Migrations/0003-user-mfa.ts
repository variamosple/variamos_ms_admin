import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const USER_MFA_TABLES = ["user_mfa", "user_mfa_recovery_code"];

// Two-factor authentication (SPC-2026-10-17-001, EV-87 lot 5). The secret is
// stored encrypted; `enabled_at` stays empty until the first code is right.
const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS "${s}"."user_mfa" (
    "user_id" text NOT NULL,
    "secret_encrypted" text NOT NULL,
    "enabled_at" timestamp with time zone,
    "last_used_step" bigint,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_mfa_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "${s}"."user_mfa_recovery_code" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "code_hash" character varying(64) NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_mfa_recovery_code_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_mfa_recovery_code_user_id_code_hash_key"
      UNIQUE ("user_id", "code_hash"),
    CONSTRAINT "user_mfa_recovery_code_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`,
];

export const userMfa: SchemaMigration = {
  name: "0003-user-mfa",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
  },
  down: async () => {
    // Reverting would drop every enrolled second factor
    throw new Error("The user MFA migration cannot be reverted.");
  },
};
