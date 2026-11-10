import logger from "#src/common/logger.js";
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
});
