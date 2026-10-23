import type { AccessEntry, KnownAccount } from "./AccessEntry.js";

/**
 * Append-only journal of the access events. Recording never fails the
 * request: an implementation logs its own errors.
 */
export interface IAccessJournal {
  record(entry: AccessEntry): Promise<void>;
  /** The account of an e-mail, so that a failed sign-in names it. */
  accountByEmail(email: string): Promise<KnownAccount | null>;
}
