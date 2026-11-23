import { mock } from "vitest-mock-extended";
import logger from "#src/common/logger.js";
import { BUG_SYNC_INTERVAL_KEY } from "#src/Domain/Bug/Entity/BugSchedule.js";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { HEALTH_CHECK_INTERVAL_KEY } from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import {
  BACKUP_CHECK_EVERY_MS,
  type BackgroundJobs,
  followBugSyncInterval,
  followHealthCheckInterval,
  RESOURCE_SAMPLING_EVERY_MS,
  SCHEDULED_CHANGES_EVERY_MS,
  startBackgroundJobs,
} from "./BackgroundJobs.js";
import { BackgroundTaskRegistry } from "./BackgroundTaskRegistry.js";

vi.mock("#src/common/logger.js");

const MINUTE_MS = 60 * 1000;

const configurationOf = (key: string, value: number | string) =>
  Configuration.builder()
    .setKey(new ConfigurationKey(key))
    .setValue(value)
    .setType(typeof value === "number" ? "number" : "string")
    .setCategory("general")
    .setTargetServices(["all"])
    .build();

function jobsReading(configured: Promise<ResponseModel<Configuration>>) {
  const registry = new BackgroundTaskRegistry();
  const jobs = {
    healthCheckTask: {
      setIntervalMs: vi.fn(),
      start: vi.fn(),
      runNow: vi.fn(async () => undefined),
    },
    healthLogs: {
      runDailyAggregationAndPurge: vi.fn(async () => ({
        aggregatedDays: 0,
        purgedLogs: 0,
      })),
    },
    configuration: { queryByKey: vi.fn(() => configured) },
    bugLifecycle: mock<BackgroundJobs["bugLifecycle"]>(),
    bugSchedule: { getSyncIntervalMs: vi.fn(async () => 60 * MINUTE_MS) },
    bugSyncTask: { setIntervalMs: vi.fn(), start: vi.fn() },
    scheduledChanges: { applyDue: vi.fn(async () => 0) },
    resourceSampler: { sample: vi.fn(async () => undefined) },
    backupAlerts: null as { check(): Promise<void> } | null,
    tasks: registry.create,
  };
  jobs.bugLifecycle.purgeExpiredRejectedBugs.mockResolvedValue();
  return { jobs, registry };
}

const noConfiguration = () =>
  Promise.resolve(new ResponseModel<Configuration>("t"));

describe("background jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const configured = (seconds: number) =>
    Promise.resolve(
      new ResponseModel<Configuration>("t").withResponse(
        configurationOf(HEALTH_CHECK_INTERVAL_KEY, seconds),
      ),
    );

  it("applies the configured interval, then starts the checks and purges the bugs", async () => {
    const { jobs } = jobsReading(configured(20));

    await startBackgroundJobs(jobs);

    expect(jobs.configuration.queryByKey).toHaveBeenCalledWith(
      expect.objectContaining({ data: HEALTH_CHECK_INTERVAL_KEY }),
    );
    expect(jobs.healthCheckTask.setIntervalMs).toHaveBeenCalledWith(20_000);
    expect(jobs.healthCheckTask.start).toHaveBeenCalledOnce();
    expect(jobs.healthCheckTask.runNow).toHaveBeenCalledOnce();
    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledOnce();
  });

  // ADM-N55: MA-MS-01 asks for the state of a service within 30 s
  it("brings a configured interval over 30 s back to 30 s", async () => {
    const { jobs } = jobsReading(configured(3600));

    await startBackgroundJobs(jobs);

    expect(jobs.healthCheckTask.setIntervalMs).toHaveBeenCalledWith(30_000);
    expect(logger.warn).toHaveBeenCalledWith(
      `${HEALTH_CHECK_INTERVAL_KEY} = 3600 is out of its bounds: 30 s used`,
    );
  });

  it("keeps the environment interval when the key cannot be read", async () => {
    const { jobs } = jobsReading(Promise.reject(new Error("db down")));

    await startBackgroundJobs(jobs);

    expect(jobs.healthCheckTask.setIntervalMs).not.toHaveBeenCalled();
    expect(jobs.healthCheckTask.start).toHaveBeenCalledOnce();
  });

  // ADM-N51: the monitoring stops no more without a word
  it("makes the sampling and the daily aggregation tasks of the registry", async () => {
    const { jobs, registry } = jobsReading(noConfiguration());

    await startBackgroundJobs(jobs);

    expect(registry.list().map((task) => task.name)).toEqual([
      "Health checks daily aggregation",
      "Container resources sampling",
      "Periodic expired bugs purge",
      "Scheduled configuration changes",
    ]);
    expect(jobs.resourceSampler.sample).toHaveBeenCalledOnce();
    expect(jobs.healthLogs.runDailyAggregationAndPurge).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(RESOURCE_SAMPLING_EVERY_MS);
    expect(jobs.resourceSampler.sample).toHaveBeenCalledTimes(2);
  });

  // ADM-N48: the first runs went one after the other
  it("starts every task even when a first run hangs", async () => {
    const { jobs } = jobsReading(noConfiguration());
    // A purge that never answers
    jobs.bugLifecycle.purgeExpiredRejectedBugs.mockReturnValue(
      new Promise<void>(() => {}),
    );
    const check = vi.fn(async () => undefined);
    jobs.backupAlerts = { check };

    const started = startBackgroundJobs(jobs);
    await vi.advanceTimersByTimeAsync(0);

    expect(jobs.scheduledChanges.applyDue).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledOnce();
    expect(jobs.bugSyncTask.start).toHaveBeenCalledOnce();
    expect(jobs.healthCheckTask.start).toHaveBeenCalledOnce();

    // The hanging purge reaches its time limit, and the start ends
    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    await expect(started).resolves.toBeUndefined();
    expect(logger.err).toHaveBeenCalledWith(
      "Periodic expired bugs purge failed: did not end within 10 min",
    );
  });

  it("starts the bugs sync at the configured interval, then purges every 24 hours", async () => {
    const { jobs } = jobsReading(noConfiguration());
    jobs.bugLifecycle.purgeExpiredRejectedBugs
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue();

    await startBackgroundJobs(jobs);

    expect(jobs.bugSyncTask.setIntervalMs).toHaveBeenCalledWith(60 * MINUTE_MS);
    expect(jobs.bugSyncTask.start).toHaveBeenCalledOnce();
    expect(
      jobs.bugSyncTask.setIntervalMs.mock.invocationCallOrder[0],
    ).toBeLessThan(jobs.bugSyncTask.start.mock.invocationCallOrder[0] ?? 0);

    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE_MS);
    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE_MS);
    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledTimes(3);
  });

  it("applies the planned changes at start-up, then every minute, past a failed pass (EV-115 lot B)", async () => {
    const { jobs } = jobsReading(noConfiguration());
    jobs.scheduledChanges.applyDue
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(0);

    await startBackgroundJobs(jobs);
    expect(jobs.scheduledChanges.applyDue).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(SCHEDULED_CHANGES_EVERY_MS);
    await vi.advanceTimersByTimeAsync(SCHEDULED_CHANGES_EVERY_MS);
    expect(jobs.scheduledChanges.applyDue).toHaveBeenCalledTimes(3);
  });

  it("checks the backup at start-up, then every hour, when it has a status file (EV-86)", async () => {
    const { jobs } = jobsReading(noConfiguration());
    const check = vi.fn(async () => undefined);
    jobs.backupAlerts = { check };

    await startBackgroundJobs(jobs);
    expect(check).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(BACKUP_CHECK_EVERY_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("follows a change of the bugs sync interval only", () => {
    const task = { setIntervalMs: vi.fn() };
    const onChange = followBugSyncInterval(task);

    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 30));
    expect(task.setIntervalMs).not.toHaveBeenCalled();

    onChange(configurationOf(BUG_SYNC_INTERVAL_KEY, 60));
    expect(task.setIntervalMs).toHaveBeenCalledWith(60 * MINUTE_MS);
    onChange(configurationOf(BUG_SYNC_INTERVAL_KEY, 1));
    expect(task.setIntervalMs).toHaveBeenLastCalledWith(15 * MINUTE_MS);
  });

  it("follows a change of the interval key only, with a positive value", () => {
    const task = { setIntervalMs: vi.fn() };
    const onChange = followHealthCheckInterval(task);

    onChange(configurationOf("security.lockout.max_attempts", 5));
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 0));
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, "soon"));
    expect(task.setIntervalMs).not.toHaveBeenCalled();

    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 20));
    expect(task.setIntervalMs).toHaveBeenCalledWith(20_000);
    // Within 5 to 30 s, whatever was written in the database (ADM-N55)
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 86_400));
    expect(task.setIntervalMs).toHaveBeenLastCalledWith(30_000);
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 1));
    expect(task.setIntervalMs).toHaveBeenLastCalledWith(5_000);
  });
});
