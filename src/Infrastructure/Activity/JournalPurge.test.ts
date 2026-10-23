import { mock } from "vitest-mock-extended";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import { purgeJournals, startJournalPurge } from "./JournalPurge.js";

const journalOf = (name: string) => {
  const journal = mock<IJournalPurge>();
  Object.assign(journal, { journal: name });
  return journal;
};

describe("purge of the journals (T-24)", () => {
  it("purges every journal, even after a failure", async () => {
    const activity = journalOf("activity");
    const access = journalOf("access");
    activity.purgeExpired.mockRejectedValue(new Error("down"));
    access.purgeExpired.mockResolvedValue(3);

    await expect(purgeJournals([activity, access])).resolves.toBeUndefined();
    expect(access.purgeExpired).toHaveBeenCalledOnce();
  });

  it("purges at start-up, then at each interval", async () => {
    vi.useFakeTimers();
    try {
      const access = journalOf("access");
      access.purgeExpired.mockResolvedValue(0);

      const timer = startJournalPurge([access], 1000);
      expect(access.purgeExpired).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(access.purgeExpired).toHaveBeenCalledTimes(3);
      clearInterval(timer);
    } finally {
      vi.useRealTimers();
    }
  });
});
