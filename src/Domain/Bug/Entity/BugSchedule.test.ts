import {
  bugSyncIntervalMsOf,
  isAcceptedBugSyncInterval,
  isAcceptedRejectedBugRetention,
  rejectedBugRetentionDaysOf,
} from "./BugSchedule.js";

const MINUTE_MS = 60 * 1000;

describe("bug tracker schedule", () => {
  it.each([5, 15, 1440])("accepts a synchronization every %i minutes", (m) => {
    expect(isAcceptedBugSyncInterval(m)).toBe(true);
    expect(bugSyncIntervalMsOf(m)).toBe(m * MINUTE_MS);
  });

  it.each([4, 1441, 7.5, "15", null, undefined])(
    "takes 15 minutes for %j",
    (value) => {
      expect(isAcceptedBugSyncInterval(value)).toBe(false);
      expect(bugSyncIntervalMsOf(value)).toBe(15 * MINUTE_MS);
    },
  );

  it.each([1, 30, 365])("keeps a rejected bug %i days", (days) => {
    expect(isAcceptedRejectedBugRetention(days)).toBe(true);
    expect(rejectedBugRetentionDaysOf(days)).toBe(days);
  });

  it.each([0, 366, 2.5, "7", null, undefined])(
    "keeps a rejected bug 7 days for %j",
    (value) => {
      expect(isAcceptedRejectedBugRetention(value)).toBe(false);
      expect(rejectedBugRetentionDaysOf(value)).toBe(7);
    },
  );
});
