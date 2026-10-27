import { mock } from "vitest-mock-extended";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { HEALTH_CHECK_INTERVAL_KEY } from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
import {
  type BackgroundJobs,
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
    bugSync: mock<BackgroundJobs["bugSync"]>(),
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

  it("syncs every 15 minutes and purges every 24 hours, past a failed run", async () => {
    const jobs = jobsReading(
      Promise.resolve(new ResponseModel<Configuration>("t")),
    );
    jobs.bugSync.syncBugs
      .mockRejectedValueOnce(new Error("GitHub down"))
      .mockResolvedValue(new ResponseModel("t"));

    await startBackgroundJobs(jobs);
    await vi.advanceTimersByTimeAsync(30 * MINUTE_MS);

    expect(jobs.bugSync.syncBugs).toHaveBeenCalledTimes(2);
    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE_MS);

    expect(jobs.bugLifecycle.purgeExpiredRejectedBugs).toHaveBeenCalledTimes(2);
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
