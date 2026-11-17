import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import { addConfigurationKeys } from "./configurationKeys.js";
import {
  type MigrationContext,
  refuseRollback,
  type SchemaMigration,
} from "./MigrationContext.js";

export const KNOWN_DEVICES_TABLE = "admin_known_devices";

// Values as of 2026-11-17 (EV-88): a migration never changes once applied
export const NEW_DEVICE_SCOPE_ROW = {
  key: "security.alerts.new_device.scope",
  value: "administrators",
  type: "string",
  category: "security",
  description:
    'Whose sign-in from a new browser and a new address mails the account itself: "off", "administrators" or "everyone". Browsers are remembered for every account.',
};

// The off-hours rule is removed: a fixed span raised alerts on ordinary
// sign-ins. A planned change of these keys goes with them (ON DELETE CASCADE).
export const RETIRED_OFF_HOURS_KEYS = [
  "security.alerts.off_hours",
  "security.alerts.timezone",
] as const;

// The browsers seen on each account: only the SHA-256 of the identifier the
// browser keeps in its cookie. An account deleted takes its rows with it.
const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS "${s}"."${KNOWN_DEVICES_TABLE}" (
    "user_id" text NOT NULL,
    "device_hash" character(64) NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "admin_known_devices_pkey" PRIMARY KEY ("user_id", "device_hash"),
    CONSTRAINT "admin_known_devices_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "admin_known_devices_last_seen_idx"
     ON "${s}"."${KNOWN_DEVICES_TABLE}" ("last_seen_at")`,
];

export const knownDevices: SchemaMigration = {
  name: "0033-known-devices",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    const retired = await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
      return sequelize.query<{ key: string }>(
        `DELETE FROM "${schema}"."configurations"
          WHERE "key" IN (:keys)
          RETURNING "key"`,
        {
          replacements: { keys: [...RETIRED_OFF_HOURS_KEYS] },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
    });
    await addConfigurationKeys(context, "0033-known-devices", [
      NEW_DEVICE_SCOPE_ROW,
    ]);
    logger.info(
      `[MIGRATION] 0033-known-devices: table ready, ${retired.length} off-hours key(s) removed`,
    );
  },
  // Reverting would forget the devices and bring back a removed rule
  down: refuseRollback("known devices"),
};
