/**
 * Tiered retention of the health checks (EV-101): complete days are saved as
 * daily statistics, then the raw checks are purged.
 */
export interface IHealthLogArchive {
  /** Saves the days in [from, to) not saved yet; returns the rows saved. */
  aggregateDays(from: Date, to: Date): Promise<number>;
  /** Deletes the checks made before `cutoff`; returns how many. */
  purgeChecksBefore(cutoff: Date): Promise<number>;
}
