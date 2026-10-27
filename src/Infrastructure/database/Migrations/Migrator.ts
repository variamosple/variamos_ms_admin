import type { Sequelize } from "sequelize";
import { SequelizeStorage, Umzug } from "umzug";
import logger from "#src/common/logger.js";
import { baseline } from "./0001-baseline.js";
import { accountLockoutKeys } from "./0002-account-lockout-keys.js";
import { userMfa } from "./0003-user-mfa.js";
import { mfaTrustedDevices } from "./0004-mfa-trusted-devices.js";
import { adminActivityLogs } from "./0005-admin-activity-logs.js";
import { adminAccessLogs } from "./0006-admin-access-logs.js";
import { bugAssignees } from "./0007-bug-assignees.js";
import { bugSeverityComponent } from "./0008-bug-severity-component.js";
import { healthLogIndexes } from "./0009-health-log-indexes.js";
import { securityAlertKeys } from "./0010-security-alert-keys.js";
import type { SchemaMigration } from "./MigrationContext.js";

// Applied in order at start-up, each one once; append new migrations here
export const ADMIN_MIGRATIONS: SchemaMigration[] = [
  baseline,
  accountLockoutKeys,
  userMfa,
  mfaTrustedDevices,
  adminActivityLogs,
  adminAccessLogs,
  bugAssignees,
  bugSeverityComponent,
  healthLogIndexes,
  securityAlertKeys,
];

// The schema is shared with other services: a name of our own
export const ADMIN_MIGRATIONS_TABLE = "admin_migrations";

export function createMigrator(
  sequelize: Sequelize,
  schema: string,
  migrations: SchemaMigration[] = ADMIN_MIGRATIONS,
): Umzug<{ sequelize: Sequelize; schema: string }> {
  if (!schema.trim()) {
    // An empty DB_SCHEMA would put the tables in "public"
    throw new Error("DB_SCHEMA is empty: refusing to run the migrations.");
  }
  return new Umzug({
    migrations,
    context: { sequelize, schema },
    storage: new SequelizeStorage({
      sequelize,
      schema,
      tableName: ADMIN_MIGRATIONS_TABLE,
      modelName: "AdminMigration",
    }),
    logger: {
      info: (event) => logger.info(`[MIGRATION] ${JSON.stringify(event)}`),
      warn: (event) => logger.warn(`[MIGRATION] ${JSON.stringify(event)}`),
      error: (event) => logger.err(`[MIGRATION] ${JSON.stringify(event)}`),
      debug: () => {},
    },
  });
}

// The database may still be starting when the service starts (deploy, reboot)
export async function waitForDatabase(
  sequelize: Sequelize,
  attempts = 10,
  delayMs = 3000,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (e) {
      if (attempt >= attempts) {
        throw e;
      }
      logger.warn(
        `[MIGRATION] Database unreachable (${attempt}/${attempts}): ${(e as Error).message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Returns the names of the migrations applied by this run
export async function runMigrations(
  sequelize: Sequelize,
  schema: string,
  migrations?: SchemaMigration[],
): Promise<string[]> {
  const applied = await createMigrator(sequelize, schema, migrations).up();
  return applied.map((migration) => migration.name);
}
