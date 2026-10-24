import logger from "jet-logger";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import "./pre-start.js"; // Must be the first import

import {
  initKeyStore,
  validateRolesAndPermissions,
} from "@variamosple/variamos-security";
import EnvVars from "#src/common/EnvVars.js";
import {
  AccessJournalInstance,
  AccountLockoutInstance,
  ActivityJournalInstance,
  ConfigEventPublisherInstance,
  MicroServiceRepositoryInstance,
  productionAccessHierarchyUseCase,
  productionBugAttachmentUseCase,
  productionBugLifecycleUseCase,
  productionBugQueryUseCase,
  productionBugSubmissionUseCase,
  productionBugSyncUseCase,
  productionConfigurationUseCase,
  productionCountriesQueryUseCase,
  productionJournalQueryUseCase,
  productionMetricsQueryUseCase,
  productionMfaResetUseCase,
  productionMfaSignInUseCase,
  productionMicroServiceManagementUseCase,
  productionMicroServiceQueryUseCase,
  productionNotificationAccessTokenIssuer,
  productionPermissionUseCase,
  productionRoleManagementUseCase,
  productionRolePermissionUseCase,
  productionRoleQueryUseCase,
  productionTrustedDeviceUseCase,
  productionUserAuthUseCase,
  productionUserManagementUseCase,
  productionUserMfaUseCase,
  productionUserPasswordUseCase,
  productionUserQueryUseCase,
  productionUserRoleUseCase,
  productionVisitUseCase,
  SecretConfigurationValueInstance,
} from "./CompositionRoot.js";
import { encryptPlainSecrets } from "./DataProviders/Configuration/EncryptPlainSecrets.js";
import { RequestModel } from "./Domain/Core/Entity/RequestModel.js";
import {
  attachContainerLogsWebSocket,
  CONTAINER_LOGS_PERMISSION,
} from "./EntryPoints/ContainerLogsWebSocket.js";
import { createBaseRouter } from "./EntryPoints/index.js";
import {
  runMigrations,
  waitForDatabase,
} from "./Infrastructure/database/Migrations/Migrator.js";
import { HealthCheckCollector } from "./Infrastructure/Health/HealthCheckCollector.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "./Infrastructure/VariamosORM.js";
import { createServer } from "./server.js";
import "./DataProviders/Bug/BugAssociations.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { missingRequiredSecrets } from "#src/common/requiredSecrets.js";
import { startJournalPurge } from "./Infrastructure/Activity/JournalPurge.js";

// Without these secrets the server would run on empty or known values, or on
// test credentials: in production, it does not start (EV-69)
const missingSecrets = missingRequiredSecrets(process.env, EnvVars.NodeEnv);
if (missingSecrets.length > 0) {
  logger.err(
    `[CONFIG] Missing in production, the server does not start: ${missingSecrets.join(", ")}`,
  );
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "./public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Uploads are kept in memory, within the size limit, until the use case has
// checked the request and the file type; only then is the file written, under
// a server-generated name (DiskStorageService).
const productionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1 },
});

const baseRouter = createBaseRouter(
  {
    auth: productionUserAuthUseCase,
    password: productionUserPasswordUseCase,
    management: productionUserManagementUseCase,
    query: productionUserQueryUseCase,
    role: productionUserRoleUseCase,
  },
  {
    submission: productionBugSubmissionUseCase,
    lifecycle: productionBugLifecycleUseCase,
    sync: productionBugSyncUseCase,
    query: productionBugQueryUseCase,
    attachment: productionBugAttachmentUseCase,
  },
  {
    query: productionMicroServiceQueryUseCase,
    management: productionMicroServiceManagementUseCase,
  },
  {
    management: productionRoleManagementUseCase,
    query: productionRoleQueryUseCase,
    permission: productionRolePermissionUseCase,
  },
  productionMetricsQueryUseCase,
  productionPermissionUseCase,
  productionVisitUseCase,
  productionCountriesQueryUseCase,
  productionConfigurationUseCase,
  productionUpload,
  productionNotificationAccessTokenIssuer,
  productionAccessHierarchyUseCase,
  AccountLockoutInstance,
  productionUserMfaUseCase,
  productionMfaSignInUseCase,
  productionMfaResetUseCase,
  productionTrustedDeviceUseCase,
  ActivityJournalInstance,
  AccessJournalInstance,
  productionJournalQueryUseCase,
);

const app = createServer(baseRouter);

const healthCheckCollectorInstance = new HealthCheckCollector(
  MicroServiceRepositoryInstance,
  EnvVars.MONITORING.HEALTH_CHECK_INTERVAL_MS,
);
MicroServiceRepositoryInstance.setHealthCollector(healthCheckCollectorInstance);

// Listen to dynamic configuration updates to reconfigure collector live
ConfigEventPublisherInstance.addListener((config) => {
  if (config.key.getValue() === "monitoring.health_check_interval_seconds") {
    const seconds = Number(config.value);
    if (!Number.isNaN(seconds) && seconds > 0) {
      healthCheckCollectorInstance.setIntervalMs(seconds * 1000);
    }
  }
});

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

  try {
    // Check if monitoring.health_check_interval_seconds exists in DB config
    try {
      const configRes = await productionConfigurationUseCase.queryByKey(
        new RequestModel(undefined, "monitoring.health_check_interval_seconds"),
      );
      if (configRes.data?.value) {
        const val = Number(configRes.data.value);
        if (!Number.isNaN(val) && val > 0) {
          healthCheckCollectorInstance.setIntervalMs(val * 1000);
        }
      }
    } catch {
      // Configuration key might not exist initially, fallback remains EnvVars
    }

    // Start periodic HealthCheckCollector
    healthCheckCollectorInstance.start();

    // Purge expired rejected bugs (older than 7 days) on startup
    await productionBugLifecycleUseCase.purgeExpiredRejectedBugs();
  } catch (e) {
    const err = e as Error;
    logger.err(`Failed to start background tasks: ${err.message}`);
  }

  // Run periodic bugs sync every 15 minutes
  const SYNC_INTERVAL = 15 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info("Executing periodic bugs synchronization...");
      const request = new RequestModel<void>("periodicSyncBugs");
      await productionBugSyncUseCase.syncBugs(request);
    } catch (e) {
      const err = e as Error;
      logger.err(`Failed to execute periodic bugs sync: ${err.message}`);
    }
  }, SYNC_INTERVAL);

  // Run periodic expired bugs purge (default: every 24 hours)
  const PURGE_INTERVAL = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info("Executing periodic expired bugs purge...");
      await productionBugLifecycleUseCase.purgeExpiredRejectedBugs();
    } catch (e) {
      const err = e as Error;
      logger.err(
        `Failed to execute periodic expired bugs purge: ${err.message}`,
      );
    }
  }, PURGE_INTERVAL);
});

attachContainerLogsWebSocket(server, {
  allowedOrigins: EnvVars.CORS.AllowedOriginsPatterns,
  checkAccess: (token) =>
    validateRolesAndPermissions(token, [CONTAINER_LOGS_PERMISSION]),
  watchLogs: (request) =>
    productionMicroServiceQueryUseCase.watchMicroServiceLogs(request),
});
