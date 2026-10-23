import logger from "jet-logger";
import { describeError } from "#src/common/describeError.js";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes the expired entries of each journal; one failure stops none. */
export async function purgeJournals(journals: IJournalPurge[]): Promise<void> {
  for (const journal of journals) {
    try {
      const deleted = await journal.purgeExpired();
      if (deleted > 0) {
        logger.info(`[PURGE] ${deleted} expired ${journal.journal} entries`);
      }
    } catch (error) {
      logger.err(`[PURGE] ${journal.journal} journal: ${describeError(error)}`);
    }
  }
}

/**
 * Applies the retention of the journals at start-up, then once a day
 * (T-24): one year for the activity, six months for the access.
 */
export function startJournalPurge(
  journals: IJournalPurge[],
  everyMs = DAY_MS,
): NodeJS.Timeout {
  void purgeJournals(journals);
  const timer = setInterval(() => void purgeJournals(journals), everyMs);
  timer.unref();
  return timer;
}
