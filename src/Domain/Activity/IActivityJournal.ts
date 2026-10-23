import type { ActivityEntry } from "./ActivityEntry.js";

/**
 * Append-only journal of the administration operations. Recording never
 * fails the operation: an implementation logs its own errors.
 */
export interface IActivityJournal {
  record(entry: ActivityEntry): Promise<void>;
}
