import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const TRUSTED_DEVICE_TABLE = "user_mfa_trusted_device";

// Value as of 2026-10-22 (SPC-2026-10-17-001, lot 6): a migration never
// changes once applied, so it is written here rather than read from the code
export const TRUSTED_DEVICE_DAYS_ROW = {
  key: "security.mfa.trusted_device_days",
  value: 14,
  description:
    "Days a browser may skip the sign-in code once the user asks for it (0 to 90; 0 always asks the code).",
};

// Browsers where the user chose not to be asked the code. Only the hash of
// the token kept in the cookie is stored.
const statement = (s: string) =>
  `CREATE TABLE IF NOT EXISTS "${s}"."${TRUSTED_DEVICE_TABLE}" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "token_hash" character varying(64) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_mfa_trusted_device_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_mfa_trusted_device_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "user_mfa_trusted_device_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`;

export const mfaTrustedDevices: SchemaMigration = {
  name: "0004-mfa-trusted-devices",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const added = await sequelize.transaction(async (transaction) => {
      await sequelize.query(statement(schema), { transaction });
      // A key already there keeps the value an administrator gave it
      return sequelize.query<{ key: string }>(
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
          replacements: {
            ...TRUSTED_DEVICE_DAYS_ROW,
            value: JSON.stringify(TRUSTED_DEVICE_DAYS_ROW.value),
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
    });
    logger.info(
      `[MIGRATION] 0004-mfa-trusted-devices: table ready, key ${TRUSTED_DEVICE_DAYS_ROW.key} ${added.length > 0 ? "added" : "already present and left untouched"}`,
    );
  },
  down: async () => {
    // Reverting would drop the value an administrator may have set
    throw new Error("The trusted devices migration cannot be reverted.");
  },
};
