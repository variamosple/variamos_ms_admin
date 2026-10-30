import { mock } from "vitest-mock-extended";
import { BUG_SYNC_INTERVAL_KEY } from "#src/Domain/Bug/Entity/BugSchedule.js";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { HEALTH_CHECK_INTERVAL_KEY } from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import {
  type BackgroundJobs,
  followBugSyncInterval,
  followHealthCheckInterval,
  startBackgroundJobs,
} from "./BackgroundJobs.js";

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
  const jobs = {
    collector: { setIntervalMs: vi.fn(), start: vi.fn() },
    configuration: { queryByKey: vi.fn(() => configured) },
    bugLifecycle: mock<BackgroundJobs["bugLifecycle"]>(),
    bugSchedule: { getSyncIntervalMs: vi.fn(async () => 60 * MINUTE_MS) },
    bugSyncTask: { setIntervalMs: vi.fn(), start: vi.fn() },
  };
  jobs.bugLifecycle.purgeExpiredRejectedBugs.mockResolvedValue();
  return jobs;
}

describe("background jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("applies the configured interval, then starts the checks and purges the bugs", async () => {
    const jobs = jobsReading(
      Promise.resolve(
        new ResponseModel<Configuration>("t").withResponse(
          configurationOf(HEALTH_CHECK_INTERVAL_KEY, 60),
        ),
      ),
    );

    await startBackgroundJobs(jobs);

    expect(jobs.configuration.queryByKey).toHaveBeenCalledWith(
      expect.objectContaining({ data: HEALTH_CHECK_INTERVAL_KEY }),
    );
    expect(jobs.collector.setIntervalMs).toHaveBeenCalledWith(60_000);
    expect(jobs.collector.start).toHaveBeenCalledOnce();
    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledOnce();
  });

  it("keeps the environment interval when the key cannot be read", async () => {
    const jobs = jobsReading(Promise.reject(new Error("db down")));

    await startBackgroundJobs(jobs);

    expect(jobs.collector.setIntervalMs).not.toHaveBeenCalled();
    expect(jobs.collector.start).toHaveBeenCalledOnce();
  });

  it("starts the bugs sync at the configured interval, then purges every 24 hours", async () => {
    const jobs = jobsReading(
      Promise.resolve(new ResponseModel<Configuration>("t")),
    );
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
    const collector = { setIntervalMs: vi.fn() };
    const onChange = followHealthCheckInterval(collector);

    onChange(configurationOf("security.lockout.max_attempts", 5));
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 0));
    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, "soon"));
    expect(collector.setIntervalMs).not.toHaveBeenCalled();

    onChange(configurationOf(HEALTH_CHECK_INTERVAL_KEY, 30));
    expect(collector.setIntervalMs).toHaveBeenCalledWith(30_000);
  });
});
