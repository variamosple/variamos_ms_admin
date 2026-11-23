import logger from "#src/common/logger.js";
import {
  BUG_SYNC_INTERVAL_KEY,
  bugSyncIntervalMsOf,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import type { IBugScheduleProvider } from "#src/Domain/Bug/Service/BugScheduleService.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import type { ScheduledConfigurationChangeUseCase } from "#src/Domain/Configuration/UseCase/ScheduledConfigurationChangeUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import {
  HEALTH_CHECK_INTERVAL_KEY,
  healthCheckIntervalMsOf,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import type { HealthCheckCollector } from "../Health/HealthCheckCollector.js";
import type { TaskFactory } from "./BackgroundTaskRegistry.js";
import type { RepeatingTask } from "./RepeatingTask.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BUG_PURGE_EVERY_MS = DAY_MS;

/** The backup status is written once a night: an hourly look is enough. */
export const BACKUP_CHECK_EVERY_MS = 60 * 60 * 1000;

/** Planned changes are applied within a minute of their date (EV-115). */
export const SCHEDULED_CHANGES_EVERY_MS = 60 * 1000;

/** Every 30 s, like the health checks by default (EV-86 lot 2). */
export const RESOURCE_SAMPLING_EVERY_MS = 30 * 1000;

/**
 * A cycle of health checks tries each service on up to four addresses with
 * a timeout of 5 s each: with several services down it may take longer than
 * its interval without being stuck.
 */
export const HEALTH_CHECKS_TIMEOUT_MS = 2 * 60 * 1000;

type Task = Pick<RepeatingTask, "start" | "runNow">;

export interface BackgroundJobs {
  configuration: Pick<ConfigurationUseCase, "queryByKey">;
  bugLifecycle: Pick<BugLifecycleUseCase, "purgeExpiredRejectedBugs">;
  bugSchedule: Pick<IBugScheduleProvider, "getSyncIntervalMs">;
  bugSyncTask: Pick<RepeatingTask, "setIntervalMs" | "start">;
  /** Made with the composition, so that the configuration screen moves it. */
  healthCheckTask: Pick<RepeatingTask, "setIntervalMs" | "start" | "runNow">;
  /** Aggregates the history of the health checks, once a day. */
  healthLogs: Pick<HealthCheckCollector, "runDailyAggregationAndPurge">;
  scheduledChanges: Pick<ScheduledConfigurationChangeUseCase, "applyDue">;
  /** Reads the CPU and memory of the containers (EV-86 lot 2). */
  resourceSampler: { sample(): Promise<void> };
  /** Checks the nightly database backup; null without its status file. */
  backupAlerts: { check(): Promise<void> } | null;
  /** Makes the tasks below, followed by the monitoring page (ADM-N34). */
  tasks: TaskFactory;
}

/**
 * The interval of the health checks for a configured value, brought within
 * its bounds (ADM-N55); a value moved into them is logged.
 */
function healthIntervalOf(value: unknown): number | null {
  const intervalMs = healthCheckIntervalMsOf(value);
  if (intervalMs !== null && intervalMs !== Number(value) * 1000) {
    logger.warn(
      `${HEALTH_CHECK_INTERVAL_KEY} = ${String(value)} is out of its bounds: ${intervalMs / 1000} s used`,
    );
  }
  return intervalMs;
}

/** Applies a change of the health check interval at once (T-18 lot 4b). */
export function followHealthCheckInterval(
  task: Pick<RepeatingTask, "setIntervalMs">,
): (config: Configuration) => void {
  return (config) => {
    if (config.key.getValue() !== HEALTH_CHECK_INTERVAL_KEY) return;
    const intervalMs = healthIntervalOf(config.value);
    if (intervalMs !== null) task.setIntervalMs(intervalMs);
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
      const intervalMs = healthIntervalOf(configRes.data.value);
      if (intervalMs !== null) jobs.healthCheckTask.setIntervalMs(intervalMs);
    }
  } catch {
    // Configuration key might not exist initially, fallback remains EnvVars
  }
}

async function startBugSync(jobs: BackgroundJobs): Promise<void> {
  try {
    jobs.bugSyncTask.setIntervalMs(await jobs.bugSchedule.getSyncIntervalMs());
  } finally {
    jobs.bugSyncTask.start();
  }
}

/**
 * Starts every background task: the health checks and their daily
 * aggregation, the sampling of the containers' CPU and memory, the purge of
 * the expired rejected bugs, the bugs synchronization at the configured
 * interval, the planned configuration changes and the backup check. Called
 * once the server listens.
 *
 * Every timer starts first, then the first runs go together (ADM-N48): a
 * first run that hangs delays no other task, and reaches the alerts through
 * its time limit. A failed run is logged and the next one still happens.
 */
export async function startBackgroundJobs(jobs: BackgroundJobs): Promise<void> {
  const tasks: Task[] = [
    jobs.healthCheckTask,
    jobs.tasks(
      "Health checks daily aggregation",
      () => jobs.healthLogs.runDailyAggregationAndPurge(),
      DAY_MS,
    ),
    jobs.tasks(
      "Container resources sampling",
      () => jobs.resourceSampler.sample(),
      RESOURCE_SAMPLING_EVERY_MS,
      { logRuns: false },
    ),
    jobs.tasks(
      "Periodic expired bugs purge",
      () => jobs.bugLifecycle.purgeExpiredRejectedBugs(),
      BUG_PURGE_EVERY_MS,
    ),
    // Changes due while the service was stopped are applied at once
    jobs.tasks(
      "Scheduled configuration changes",
      () => jobs.scheduledChanges.applyDue(),
      SCHEDULED_CHANGES_EVERY_MS,
    ),
  ];
  const { backupAlerts } = jobs;
  if (backupAlerts) {
    tasks.push(
      jobs.tasks(
        "Backup status check",
        () => backupAlerts.check(),
        BACKUP_CHECK_EVERY_MS,
      ),
    );
  } else {
    logger.info("Backup check off: no BACKUP_STATUS_FILE");
  }

  for (const task of tasks) task.start();
  // Run at once, so that the monitoring page shows the first runs
  const started = await Promise.allSettled([
    applyConfiguredInterval(jobs),
    startBugSync(jobs),
    ...tasks.map((task) => task.runNow()),
  ]);
  for (const outcome of started) {
    if (outcome.status === "rejected") {
      logger.err(
        `Failed to start a background task: ${errorMessage(outcome.reason)}`,
      );
    }
  }
}
