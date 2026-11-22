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
});
