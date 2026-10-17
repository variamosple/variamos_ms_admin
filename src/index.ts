import logger from "jet-logger";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import "./pre-start.js"; // Must be the first import

import {
  initKeyStore,
  validateRolesAndPermissions,
} from "@variamosple/variamos-security";
import EnvVars from "#src/common/EnvVars.js";
import {
  ConfigEventPublisherInstance,
  MicroServiceRepositoryInstance,
  productionBugAttachmentUseCase,
  productionBugLifecycleUseCase,
  productionBugQueryUseCase,
  productionBugSubmissionUseCase,
  productionBugSyncUseCase,
  productionConfigurationUseCase,
  productionCountriesQueryUseCase,
  productionMetricsQueryUseCase,
  productionMicroServiceManagementUseCase,
  productionMicroServiceQueryUseCase,
  productionNotificationAccessTokenIssuer,
  productionPermissionUseCase,
  productionRoleManagementUseCase,
  productionRolePermissionUseCase,
  productionRoleQueryUseCase,
  productionUserAuthUseCase,
  productionUserManagementUseCase,
  productionUserPasswordUseCase,
  productionUserQueryUseCase,
  productionUserRoleUseCase,
  productionVisitUseCase,
} from "./CompositionRoot.js";
import { BugModel } from "./DataProviders/Bug/Bug.js";
import { BugAttachmentModel } from "./DataProviders/Bug/BugAttachment.js";
import { BugLogModel } from "./DataProviders/Bug/BugLog.js";
import { ConfigurationModel } from "./DataProviders/Configuration/Configuration.js";
import { MicroServiceAuditLogModel } from "./DataProviders/MicroService/MicroServiceAuditLogModel.js";
import { MicroServiceDailyStatsModel } from "./DataProviders/MicroService/MicroServiceDailyStatsModel.js";
import { MicroServiceHealthLogModel } from "./DataProviders/MicroService/MicroServiceHealthLogModel.js";
import { RequestModel } from "./Domain/Core/Entity/RequestModel.js";
import {
  attachContainerLogsWebSocket,
  CONTAINER_LOGS_PERMISSION,
} from "./EntryPoints/ContainerLogsWebSocket.js";
import { createBaseRouter } from "./EntryPoints/index.js";
import { HealthCheckCollector } from "./Infrastructure/Health/HealthCheckCollector.js";
import { createServer } from "./server.js";
import "./DataProviders/Bug/BugAssociations.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

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

const server = app.listen(EnvVars.Port, async () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);

  // Each table is synced on its own: one failing sync must not prevent the
  // health log table from being created, nor the health collector from starting.
  const modelsToSync: Array<{ name: string; sync: () => Promise<unknown> }> = [
    { name: "BugModel", sync: () => BugModel.sync() },
    { name: "BugAttachmentModel", sync: () => BugAttachmentModel.sync() },
    { name: "BugLogModel", sync: () => BugLogModel.sync() },
    { name: "ConfigurationModel", sync: () => ConfigurationModel.sync() },
    {
      name: "MicroServiceHealthLogModel",
      sync: () => MicroServiceHealthLogModel.sync(),
    },
    {
      name: "MicroServiceDailyStatsModel",
      sync: () => MicroServiceDailyStatsModel.sync(),
    },
    {
      name: "MicroServiceAuditLogModel",
      sync: () => MicroServiceAuditLogModel.sync(),
    },
  ];
  logger.info("Synchronizing Database models...");
  for (const model of modelsToSync) {
    try {
      await model.sync();
    } catch (e) {
      logger.err(
        `Failed to synchronize table for ${model.name}: ${(e as Error).message}`,
      );
    }
  }
  logger.info("Database models synchronization finished.");

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

    // Start periodic HealthCheckCollector, even if some table sync failed above
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
