import { BackgroundTaskRegistry } from "./BackgroundTaskRegistry.js";

vi.mock("#src/common/logger.js");

describe("BackgroundTaskRegistry (ADM-N34)", () => {
  it("lists each task it made, in order, with its runs", async () => {
    const observer = vi.fn().mockResolvedValue(undefined);
    const registry = new BackgroundTaskRegistry(observer);
    const sync = registry.create("Sync", vi.fn().mockResolvedValue(1), 1000);
    registry.create("Purge", vi.fn().mockResolvedValue(1), 2000);

    await sync.runNow();

    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: "Sync",
        intervalMs: 1000,
        consecutiveFailures: 0,
        lastSuccessAt: expect.any(Date),
      }),
      expect.objectContaining({ name: "Purge", lastRunAt: null }),
    ]);
    expect(observer).toHaveBeenCalledOnce();
  });

  it("stops every task it made when the service shuts down (ADM-N21)", async () => {
    vi.useFakeTimers();
    try {
      const registry = new BackgroundTaskRegistry();
      const sync = vi.fn().mockResolvedValue(1);
      const purge = vi.fn().mockResolvedValue(1);
      registry.create("Sync", sync, 1000).start();
      registry.create("Purge", purge, 1000).start();

      registry.stopAll();
      await vi.advanceTimersByTimeAsync(5000);

      expect(sync).not.toHaveBeenCalled();
      expect(purge).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
