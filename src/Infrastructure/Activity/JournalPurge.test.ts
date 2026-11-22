import { mock } from "vitest-mock-extended";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import { BackgroundTaskRegistry } from "../Scheduling/BackgroundTaskRegistry.js";
import { purgeJournals, startJournalPurge } from "./JournalPurge.js";

vi.mock("#src/common/logger.js");

const journalOf = (name: string) => {
  const journal = mock<IJournalPurge>();
  Object.assign(journal, { journal: name });
  return journal;
};

describe("purge of the journals (T-24)", () => {
  it("purges every journal, then fails naming the one not purged", async () => {
    const activity = journalOf("activity");
    const access = journalOf("access");
    activity.purgeExpired.mockRejectedValue(new Error("down"));
    access.purgeExpired.mockResolvedValue(3);

    await expect(purgeJournals([activity, access])).rejects.toThrow(
      "Journals not purged: activity",
    );
    expect(access.purgeExpired).toHaveBeenCalledOnce();
  });

  it("succeeds when every journal is purged", async () => {
    const access = journalOf("access");
    access.purgeExpired.mockResolvedValue(0);

    await expect(purgeJournals([access])).resolves.toBeUndefined();
  });

  it("purges at start-up, then at each interval, as a followed task", async () => {
    vi.useFakeTimers();
    const registry = new BackgroundTaskRegistry();
    try {
      const access = journalOf("access");
      access.purgeExpired.mockResolvedValue(0);

      await startJournalPurge([access], registry.create, 1000);
      expect(access.purgeExpired).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(access.purgeExpired).toHaveBeenCalledTimes(3);
      expect(registry.list()).toEqual([
        expect.objectContaining({
          name: "Journals purge",
          consecutiveFailures: 0,
        }),
      ]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
