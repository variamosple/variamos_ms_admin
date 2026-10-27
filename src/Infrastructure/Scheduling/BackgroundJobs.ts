import logger from "#src/common/logger.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import {
  HEALTH_CHECK_INTERVAL_KEY,
  healthCheckIntervalMsOf,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import type { HealthCheckCollector } from "../Health/HealthCheckCollector.js";

const BUG_SYNC_EVERY_MS = 15 * 60 * 1000;
const BUG_PURGE_EVERY_MS = 24 * 60 * 60 * 1000;

export interface BackgroundJobs {
  collector: Pick<HealthCheckCollector, "setIntervalMs" | "start">;
  configuration: Pick<ConfigurationUseCase, "queryByKey">;
  bugLifecycle: Pick<BugLifecycleUseCase, "purgeExpiredRejectedBugs">;
  bugSync: Pick<BugSyncUseCase, "syncBugs">;
}

/** Applies a change of the health check interval at once (T-18 lot 4b). */
export function followHealthCheckInterval(
  collector: Pick<HealthCheckCollector, "setIntervalMs">,
): (config: Configuration) => void {
  return (config) => {
    if (config.key.getValue() !== HEALTH_CHECK_INTERVAL_KEY) return;
    const intervalMs = healthCheckIntervalMsOf(config.value);
    if (intervalMs !== null) collector.setIntervalMs(intervalMs);
  };
}

async function applyConfiguredInterval(jobs: BackgroundJobs): Promise<void> {
  try {
    const configRes = await jobs.configuration.queryByKey(
      new RequestModel(undefined, HEALTH_CHECK_INTERVAL_KEY),
    );
    if (configRes.data?.value) {
      const intervalMs = healthCheckIntervalMsOf(configRes.data.value);
      if (intervalMs !== null) jobs.collector.setIntervalMs(intervalMs);
    }
  } catch {
    // Configuration key might not exist initially, fallback remains EnvVars
  }
}

/**
 * Starts the health checks, purges the expired rejected bugs, then syncs the
 * bugs every 15 minutes and purges them every 24 hours. Called once the
 * server listens; a failed run is logged and the next one still happens.
 */
export async function startBackgroundJobs(jobs: BackgroundJobs): Promise<void> {
  try {
    await applyConfiguredInterval(jobs);
    jobs.collector.start();
    await jobs.bugLifecycle.purgeExpiredRejectedBugs();
  } catch (e) {
    const err = e as Error;
    logger.err(`Failed to start background tasks: ${err.message}`);
  }

  setInterval(async () => {
    try {
      logger.info("Executing periodic bugs synchronization...");
      const request = new RequestModel<void>("periodicSyncBugs");
      await jobs.bugSync.syncBugs(request);
    } catch (e) {
      const err = e as Error;
      logger.err(`Failed to execute periodic bugs sync: ${err.message}`);
    }
  }, BUG_SYNC_EVERY_MS);

  setInterval(async () => {
    try {
      logger.info("Executing periodic expired bugs purge...");
      await jobs.bugLifecycle.purgeExpiredRejectedBugs();
    } catch (e) {
      const err = e as Error;
      logger.err(
        `Failed to execute periodic expired bugs purge: ${err.message}`,
      );
    }
  }, BUG_PURGE_EVERY_MS);
}
