/** Deletes the entries older than the retention of a journal. */
export interface IJournalPurge {
  readonly journal: string;
  purgeExpired(): Promise<number>;
}
