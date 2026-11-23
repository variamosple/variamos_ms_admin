import type {
  BackgroundTaskStatus,
  IBackgroundTaskList,
} from "#src/Domain/Scheduling/Entity/BackgroundTaskStatus.js";
import {
  RepeatingTask,
  type RepeatingTaskOptions,
  type RunObserver,
} from "./RepeatingTask.js";

/** What a task may set for itself; the observer is the registry's. */
type TaskOptions = Pick<RepeatingTaskOptions, "timeoutMs" | "logRuns">;

/** Makes a task followed by the registry. */
export type TaskFactory = (
  name: string,
  run: () => Promise<unknown>,
  intervalMs: number,
  options?: TaskOptions,
) => RepeatingTask;

/**
 * The background tasks of the service (ADM-N34): each one is listed for the
 * monitoring page, and its runs are told to the observer, the alerts. A task
 * made before the jobs start is listed even when they never start (a local
 * service on a remote database, ADM-N32): it then shows no run.
 */
export class BackgroundTaskRegistry implements IBackgroundTaskList {
  private readonly tasks: RepeatingTask[] = [];

  public constructor(private readonly observer?: RunObserver) {}

  public readonly create: TaskFactory = (name, run, intervalMs, options) => {
    const task = new RepeatingTask(name, run, intervalMs, {
      ...options,
      observer: this.observer,
    });
    this.tasks.push(task);
    return task;
  };

  /** Stops every task, when the service shuts down (ADM-N21). */
  public stopAll(): void {
    for (const task of this.tasks) task.stop();
  }

  public list(): BackgroundTaskStatus[] {
    return this.tasks.map((task) => task.status());
  }
}
