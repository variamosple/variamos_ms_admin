import logger from "#src/common/logger.js";
import "./pre-start.js"; // Must be the first import

import {
  initKeyStore,
  validateRolesAndPermissions,
} from "@variamosple/variamos-security";
import EnvVars from "#src/common/EnvVars.js";
import { missingRequiredSecrets } from "#src/common/requiredSecrets.js";
import {
  AccessJournalInstance,
  ActivityJournalInstance,
  BugSyncTask,
  HealthCheckCollectorInstance,
  productionBugLifecycleUseCase,
  productionBugSchedule,
  productionConfigurationUseCase,
  productionMicroServiceQueryUseCase,
  productionRouterDependencies,
  SecretConfigurationValueInstance,
} from "./CompositionRoot.js";
import { registerBugAssociations } from "./DataProviders/Bug/BugAssociations.js";
import { encryptPlainSecrets } from "./DataProviders/Configuration/EncryptPlainSecrets.js";
import {
  attachContainerLogsWebSocket,
  CONTAINER_LOGS_PERMISSION,
} from "./EntryPoints/ContainerLogsWebSocket.js";
import { createBaseRouter } from "./EntryPoints/index.js";
import { startJournalPurge } from "./Infrastructure/Activity/JournalPurge.js";
import {
  runMigrations,
  waitForDatabase,
} from "./Infrastructure/database/Migrations/Migrator.js";
import { startBackgroundJobs } from "./Infrastructure/Scheduling/BackgroundJobs.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "./Infrastructure/VariamosORM.js";
import { createServer } from "./server.js";

// Without these secrets the server would run on empty or known values, or on
// test credentials: in production, it does not start (EV-69)
const missingSecrets = missingRequiredSecrets(process.env, EnvVars.NodeEnv);
if (missingSecrets.length > 0) {
  logger.err(
    `[CONFIG] Missing in production, the server does not start: ${missingSecrets.join(", ")}`,
  );
  process.exit(1);
}

// The relations of the bug models, before any query that includes them
registerBugAssociations();

const app = createServer(createBaseRouter(productionRouterDependencies));

const SERVER_START_MSG = `Express server started on port: ${EnvVars.Port.toString()}`;

// The schema changes only through versioned migrations (T-07): no request is
// served on a schema that failed to migrate
try {
  await waitForDatabase(VARIAMOS_ORM);
  const applied = await runMigrations(VARIAMOS_ORM, DB_SCHEMA);
  logger.info(`[MIGRATION] ${applied.length} migration(s) applied`);
  // Retention of the journals (T-24), on tables the migrations made
  startJournalPurge([ActivityJournalInstance, AccessJournalInstance]);
} catch (e) {
  logger.err(
    `[MIGRATION] Failed, the server does not start: ${(e as Error).message}`,
  );
  process.exit(1);
}

// Secret configurations still in clear are encrypted (T-13); on failure they
// stay as they were, and the server still starts
if (SecretConfigurationValueInstance.canEncrypt()) {
  try {
    const encrypted = await encryptPlainSecrets(
      VARIAMOS_ORM,
      DB_SCHEMA,
      SecretConfigurationValueInstance,
    );
    logger.info(`[CONFIG] ${encrypted} secret configuration(s) encrypted`);
  } catch (e) {
    logger.err(
      `[CONFIG] Secret configurations left as they were: ${(e as Error).message}`,
    );
  }
} else {
  logger.warn(
    "[CONFIG] No CONFIG_ENCRYPTION_KEY: secret configurations cannot be changed",
  );
}

const server = app.listen(EnvVars.Port, async () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);
  await startBackgroundJobs({
    collector: HealthCheckCollectorInstance,
    configuration: productionConfigurationUseCase,
    bugLifecycle: productionBugLifecycleUseCase,
    bugSchedule: productionBugSchedule,
    bugSyncTask: BugSyncTask,
  });
});

attachContainerLogsWebSocket(server, {
  allowedOrigins: EnvVars.CORS.AllowedOriginsPatterns,
  checkAccess: (token) =>
    validateRolesAndPermissions(token, [CONTAINER_LOGS_PERMISSION]),
  watchLogs: (request) =>
    productionMicroServiceQueryUseCase.watchMicroServiceLogs(request),
});
