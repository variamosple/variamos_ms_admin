import logger from "#src/common/logger.js";
import "./pre-start.js"; // Must be the first import

import {
  initKeyStore,
  validateRolesAndPermissions,
} from "@variamosple/variamos-security";
import {
  checkOriginList,
  isAllowedOrigin,
} from "#src/common/allowedOrigins.js";
import {
  ALLOW_REMOTE_WRITES_VARIABLE,
  type AutomaticWrites,
  decideAutomaticWrites,
} from "#src/common/automaticWrites.js";
import EnvVars from "#src/common/EnvVars.js";
import { checkLocalDevOrigins } from "#src/common/localDevOrigins.js";
import { NodeEnvs } from "#src/common/misc.js";
import { missingRequiredSecrets } from "#src/common/requiredSecrets.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import { MailServiceInstance } from "./CompositionAdapters.js";
import { BackgroundTasks, BackupAlertsInstance } from "./CompositionAlerts.js";
import {
  AccessJournalInstance,
  ActivityJournalInstance,
  ContainerResourceSamplerInstance,
  KnownDeviceInstance,
  SecretConfigurationValueInstance,
  VisitRetentionInstance,
} from "./CompositionRepositories.js";
import {
  BugSyncTask,
  HealthCheckCollectorInstance,
  HealthCheckTask,
  productionBugLifecycleUseCase,
  productionBugSchedule,
  productionConfigurationUseCase,
  productionMicroServiceQueryUseCase,
  productionRouterDependencies,
  productionScheduledConfigurationChangeUseCase,
} from "./CompositionRoot.js";
import { registerBugAssociations } from "./DataProviders/Bug/BugAssociations.js";
import { encryptPlainSecrets } from "./DataProviders/Configuration/EncryptPlainSecrets.js";
import {
  attachContainerLogsWebSocket,
  CONTAINER_LOGS_PERMISSION,
} from "./EntryPoints/ContainerLogsWebSocket.js";
import { createBaseRouter } from "./EntryPoints/index.js";
import { checkSessionSigning } from "./EntryPoints/sessionSigningCheck.js";
import { startJournalPurge } from "./Infrastructure/Activity/JournalPurge.js";
import {
  readDatabaseEnvironment,
  runMigrations,
  waitForDatabase,
} from "./Infrastructure/database/Migrations/Migrator.js";
import {
  closeWebSockets,
  onShutdownSignals,
} from "./Infrastructure/Lifecycle/GracefulShutdown.js";
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

// The exact origins allowed with the session cookie: production does not
// start without them (EV-75)
const originList = checkOriginList(process.env, EnvVars.NodeEnv);
for (const warning of originList.warnings) logger.warn(`[CONFIG] ${warning}`);
if (originList.errors.length > 0) {
  for (const error of originList.errors) {
    logger.err(`[CONFIG] ${error}, the server does not start`);
  }
  process.exit(1);
}

// Temporary sign-in of local interfaces on production (2026-11-17)
const localDev = checkLocalDevOrigins(process.env);
for (const warning of localDev.warnings) logger.warn(`[CONFIG] ${warning}`);
if (localDev.errors.length > 0) {
  for (const error of localDev.errors) {
    logger.err(`[CONFIG] ${error}, the server does not start`);
  }
  process.exit(1);
}

// The keys are loaded, then a session token is signed and verified, before
// the migrations and before the server listens. The key store only logs a
// missing, unreadable or mismatched key: the service used to start, answer
// UP and pass the check after deployment while no one could sign in
// (ADM-N01). In production it does not start; elsewhere it says why.
try {
  await initKeyStore();
} catch (error: unknown) {
  logger.err(`[SECURITY] Keys not loaded: ${errorMessage(error)}`);
  process.exit(1);
}
const sessionSigning = await checkSessionSigning();
if (!sessionSigning.ok) {
  logger.err(`[SECURITY] Sessions cannot be opened: ${sessionSigning.reason}`);
  if (EnvVars.NodeEnv === NodeEnvs.Production.valueOf()) {
    process.exit(1);
  }
}

// The relations of the bug models, before any query that includes them
registerBugAssociations();

const app = createServer(createBaseRouter(productionRouterDependencies));

const SERVER_START_MSG = `Express server started on port: ${EnvVars.Port.toString()}`;

// The schema changes only through versioned migrations (T-07): no request is
// served on a schema that failed to migrate
let automaticWrites: AutomaticWrites;
try {
  await waitForDatabase(VARIAMOS_ORM);
  // Outside production, nothing is written without being asked to a remote
  // database or to the production one reached through a tunnel (ADM-N32)
  automaticWrites = decideAutomaticWrites({
    nodeEnv: EnvVars.NodeEnv,
    host: EnvVars.DB.HOST,
    databaseEnvironment: await readDatabaseEnvironment(VARIAMOS_ORM),
    allowRemote: process.env[ALLOW_REMOTE_WRITES_VARIABLE],
  });
  if (automaticWrites.allowed) {
    const applied = await runMigrations(VARIAMOS_ORM, DB_SCHEMA);
    logger.info(`[MIGRATION] ${applied.length} migration(s) applied`);
    // Retention of the journals (T-24), on tables the migrations made
    void startJournalPurge(
      [
        ActivityJournalInstance,
        AccessJournalInstance,
        VisitRetentionInstance,
        KnownDeviceInstance,
      ],
      BackgroundTasks.create,
    );
  }
} catch (e) {
  logger.err(
    `[MIGRATION] Failed, the server does not start: ${errorMessage(e)}`,
  );
  process.exit(1);
}

if (!automaticWrites.allowed) {
  logger.warn(
    `[DATABASE] ${automaticWrites.reason}: no migration, no encryption of the configurations and no background job. Set ${ALLOW_REMOTE_WRITES_VARIABLE}=true to allow them.`,
  );
} else if (automaticWrites.warning) {
  logger.warn(`[DATABASE] ${automaticWrites.warning}`);
}

// Secret configurations still in clear are encrypted (T-13); on failure they
// stay as they were, and the server still starts
// (on a database it may not write to, they are left to the services that may)
if (!SecretConfigurationValueInstance.canEncrypt()) {
  logger.warn(
    "[CONFIG] No CONFIG_ENCRYPTION_KEY: secret configurations cannot be changed",
  );
} else if (automaticWrites.allowed) {
  try {
    const encrypted = await encryptPlainSecrets(
      VARIAMOS_ORM,
      DB_SCHEMA,
      SecretConfigurationValueInstance,
    );
    logger.info(`[CONFIG] ${encrypted} secret configuration(s) encrypted`);
  } catch (e) {
    logger.err(
      `[CONFIG] Secret configurations left as they were: ${errorMessage(e)}`,
    );
  }
}

const server = app.listen(EnvVars.Port, async () => {
  logger.info(SERVER_START_MSG);
  if (!automaticWrites.allowed) return;
  await startBackgroundJobs({
    configuration: productionConfigurationUseCase,
    bugLifecycle: productionBugLifecycleUseCase,
    bugSchedule: productionBugSchedule,
    bugSyncTask: BugSyncTask,
    healthCheckTask: HealthCheckTask,
    healthLogs: HealthCheckCollectorInstance,
    scheduledChanges: productionScheduledConfigurationChangeUseCase,
    resourceSampler: ContainerResourceSamplerInstance,
    backupAlerts: BackupAlertsInstance,
    tasks: BackgroundTasks.create,
  });
});

const containerLogsSockets = attachContainerLogsWebSocket(server, {
  isAllowedOrigin,
  checkAccess: (token) =>
    validateRolesAndPermissions(token, [CONTAINER_LOGS_PERMISSION]),
  watchLogs: (request) =>
    productionMicroServiceQueryUseCase.watchMicroServiceLogs(request),
});

// docker stop: the requests under way finish, then the database closes,
// instead of the process dying in the middle of them (ADM-N21)
onShutdownSignals(
  {
    server,
    closeSockets: () => closeWebSockets(containerLogsSockets),
    stopJobs: () => {
      BackgroundTasks.stopAll();
      MailServiceInstance.stopRetries();
    },
    closeDatabase: () => VARIAMOS_ORM.close(),
  },
  { exit: (code) => process.exit(code) },
);
