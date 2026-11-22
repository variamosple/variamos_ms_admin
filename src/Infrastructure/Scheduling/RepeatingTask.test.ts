import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { RepeatingTask } from "./RepeatingTask.js";

vi.mock("#src/common/logger.js");

const MINUTE_MS = 60 * 1000;

describe("RepeatingTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("runs at its interval once started, past a failed run", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("GitHub down"))
      .mockResolvedValue(undefined);
    const task = new RepeatingTask("Sync", run, 15 * MINUTE_MS);

    await vi.advanceTimersByTimeAsync(15 * MINUTE_MS);
    expect(run).not.toHaveBeenCalled();

    task.start();
    task.start();
    await vi.advanceTimersByTimeAsync(30 * MINUTE_MS);

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.err).toHaveBeenCalledWith("Sync failed: GitHub down");
  });

  it("counts a new interval from the change", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const task = new RepeatingTask("Sync", run, 15 * MINUTE_MS);
    task.start();

    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    task.setIntervalMs(60 * MINUTE_MS);
    await vi.advanceTimersByTimeAsync(59 * MINUTE_MS);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(MINUTE_MS);
    expect(run).toHaveBeenCalledOnce();
    expect(task.getIntervalMs()).toBe(60 * MINUTE_MS);
  });

  it("keeps its timer when the interval does not change", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const task = new RepeatingTask("Sync", run, 15 * MINUTE_MS);
    task.start();

    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    task.setIntervalMs(15 * MINUTE_MS);
    await vi.advanceTimersByTimeAsync(5 * MINUTE_MS);

    expect(run).toHaveBeenCalledOnce();
  });

  it("takes a new interval before its start, and stops", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const task = new RepeatingTask("Sync", run, 15 * MINUTE_MS);

    task.setIntervalMs(5 * MINUTE_MS);
    task.start();
    await vi.advanceTimersByTimeAsync(5 * MINUTE_MS);
    expect(run).toHaveBeenCalledOnce();

    task.stop();
    await vi.advanceTimersByTimeAsync(60 * MINUTE_MS);
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs once on demand, a failure logged and not thrown", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("db down"));
    const task = new RepeatingTask("Planned changes", run, MINUTE_MS);

    await expect(task.runNow()).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledOnce();
    expect(logger.err).toHaveBeenCalledWith("Planned changes failed: db down");
  });

  // ADM-N37: setInterval does not wait for the previous run
  it("skips a run while the previous one is still going", async () => {
    let finish = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const task = new RepeatingTask("Sync", run, MINUTE_MS);
    task.start();

    await vi.advanceTimersByTimeAsync(3 * MINUTE_MS);
    expect(run).toHaveBeenCalledOnce();
    expect(task.status().running).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "Sync: previous run still going, this one skipped",
    );

    finish();
    await vi.advanceTimersByTimeAsync(MINUTE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  // ADM-N34: the bugs synchronization answers its failures, it never throws
  it("counts an answer that carries an error as a failure", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(
        new ResponseModel("sync").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal server error",
        ),
      );
    const task = new RepeatingTask("Sync", run, MINUTE_MS);

    await task.runNow();
    await task.runNow();

    expect(task.status()).toMatchObject({
      consecutiveFailures: 2,
      lastSuccessAt: null,
    });
    expect(logger.err).toHaveBeenCalledWith(
      "Sync failed: Internal server error",
    );
  });

  it("keeps the dates of the runs, and starts the count again after a success", async () => {
    const at = [
      new Date("2026-11-22T10:00:00Z"),
      new Date("2026-11-22T10:00:05Z"),
      new Date("2026-11-22T10:01:00Z"),
      new Date("2026-11-22T10:01:02Z"),
    ];
    const now = vi.fn(() => at.shift() ?? new Date(0));
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(new ResponseModel("sync").withResponse(null));
    const task = new RepeatingTask("Sync", run, MINUTE_MS, { now });

    await task.runNow();
    expect(task.status()).toEqual({
      name: "Sync",
      intervalMs: MINUTE_MS,
      running: false,
      lastRunAt: new Date("2026-11-22T10:00:00Z"),
      lastSuccessAt: null,
      lastFailureAt: new Date("2026-11-22T10:00:05Z"),
      consecutiveFailures: 1,
    });

    await task.runNow();
    expect(task.status()).toMatchObject({
      lastRunAt: new Date("2026-11-22T10:01:00Z"),
      lastSuccessAt: new Date("2026-11-22T10:01:02Z"),
      lastFailureAt: new Date("2026-11-22T10:00:05Z"),
      consecutiveFailures: 0,
    });
  });

  it("tells its state after each run, and survives a failing observer", async () => {
    const observer = vi
      .fn()
      .mockRejectedValueOnce(new Error("mail down"))
      .mockResolvedValue(undefined);
    const run = vi.fn().mockRejectedValue(new Error("down"));
    const task = new RepeatingTask("Sync", run, MINUTE_MS, { observer });

    await expect(task.runNow()).resolves.toBeUndefined();
    await task.runNow();

    expect(observer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Sync", consecutiveFailures: 1 }),
    );
    expect(observer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ consecutiveFailures: 2, running: false }),
    );
    expect(logger.err).toHaveBeenCalledWith(
      "Sync: state not followed: mail down",
    );
  });
});
