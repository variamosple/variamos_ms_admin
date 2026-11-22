/**
 * What is known of a background task since the service started (ADM-N34):
 * when it last ran, last succeeded and last failed, and how many runs in a
 * row failed. Kept in memory: a restart starts again from nothing. The cause
 * of a failure stays in the log of the service, never here, so that nothing
 * of a call to GitHub or to the database reaches the page.
 */
export interface BackgroundTaskStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  consecutiveFailures: number;
}

/** The tasks of the service, for the monitoring page. */
export interface IBackgroundTaskList {
  list(): BackgroundTaskStatus[];
}
