import { describeError } from "#src/common/describeError.js";
import logger from "#src/common/logger.js";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import type { TaskFactory } from "../Scheduling/BackgroundTaskRegistry.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes the expired entries of each journal; one failure stops none, and
 * the run fails at the end when a journal could not be purged (ADM-N34).
 */
export async function purgeJournals(journals: IJournalPurge[]): Promise<void> {
  const failed: string[] = [];
  for (const journal of journals) {
    try {
      const deleted = await journal.purgeExpired();
      if (deleted > 0) {
        logger.info(`[PURGE] ${deleted} expired ${journal.journal} entries`);
      }
    } catch (error) {
      failed.push(journal.journal);
      logger.err(`[PURGE] ${journal.journal} journal: ${describeError(error)}`);
    }
  }
  if (failed.length > 0) {
    throw new Error(`Journals not purged: ${failed.join(", ")}`);
  }
}

/**
 * Applies the retention of the journals at start-up, then once a day
 * (T-24): one year for the activity, six months for the access and for the
 * account of a visit.
 */
export async function startJournalPurge(
  journals: IJournalPurge[],
  tasks: TaskFactory,
  everyMs = DAY_MS,
): Promise<void> {
  const purge = tasks("Journals purge", () => purgeJournals(journals), everyMs);
  await purge.runNow();
  purge.start();
}
