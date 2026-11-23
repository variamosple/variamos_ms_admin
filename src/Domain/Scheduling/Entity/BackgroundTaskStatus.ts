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
  /** When the run under way started; null between two runs (ADM-N47). */
  runningSince: Date | null;
  /** The run under way went past its time limit and still holds the task. */
  stuck: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  consecutiveFailures: number;
}

/** What /health says of the tasks: numbers only, the route is public. */
export interface BackgroundTaskSummary {
  count: number;
  failing: number;
  stuck: number;
}

export function summaryOf(
  tasks: readonly BackgroundTaskStatus[],
): BackgroundTaskSummary {
  return {
    count: tasks.length,
    failing: tasks.filter((task) => task.consecutiveFailures > 0).length,
    stuck: tasks.filter((task) => task.stuck).length,
  };
}

/** The tasks of the service, for the monitoring page. */
export interface IBackgroundTaskList {
  list(): BackgroundTaskStatus[];
}
