/**
 * Removes what the retention of a journal no longer allows: the entries, or
 * for the visits the account they name. Gives the number of rows changed.
 */
export interface IJournalPurge {
  readonly journal: string;
  purgeExpired(): Promise<number>;
}
