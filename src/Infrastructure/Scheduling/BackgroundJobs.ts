import logger from "#src/common/logger.js";
import {
  BUG_SYNC_INTERVAL_KEY,
  bugSyncIntervalMsOf,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import type { IBugScheduleProvider } from "#src/Domain/Bug/Service/BugScheduleService.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import {
  HEALTH_CHECK_INTERVAL_KEY,
  healthCheckIntervalMsOf,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import type { HealthCheckCollector } from "../Health/HealthCheckCollector.js";
import { RepeatingTask } from "./RepeatingTask.js";

const BUG_PURGE_EVERY_MS = 24 * 60 * 60 * 1000;

export interface BackgroundJobs {
  collector: Pick<HealthCheckCollector, "setIntervalMs" | "start">;
  configuration: Pick<ConfigurationUseCase, "queryByKey">;
  bugLifecycle: Pick<BugLifecycleUseCase, "purgeExpiredRejectedBugs">;
  bugSchedule: Pick<IBugScheduleProvider, "getSyncIntervalMs">;
  bugSyncTask: Pick<RepeatingTask, "setIntervalMs" | "start">;
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

/** Applies a change of the bugs synchronization interval at once (EV-18). */
export function followBugSyncInterval(
  task: Pick<RepeatingTask, "setIntervalMs">,
): (config: Configuration) => void {
  return (config) => {
    if (config.key.getValue() !== BUG_SYNC_INTERVAL_KEY) return;
    task.setIntervalMs(bugSyncIntervalMsOf(config.value));
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
 * bugs at the configured interval (15 minutes by default) and purges them
 * every 24 hours. Called once the server listens; a failed run is logged and
 * the next one still happens.
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

  jobs.bugSyncTask.setIntervalMs(await jobs.bugSchedule.getSyncIntervalMs());
  jobs.bugSyncTask.start();

  new RepeatingTask(
    "Periodic expired bugs purge",
    () => jobs.bugLifecycle.purgeExpiredRejectedBugs(),
    BUG_PURGE_EVERY_MS,
  ).start();
}
