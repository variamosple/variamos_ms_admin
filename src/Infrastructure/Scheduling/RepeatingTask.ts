import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { BackgroundTaskStatus } from "#src/Domain/Scheduling/Entity/BackgroundTaskStatus.js";

/** Told of the state of the task after each run, an alert for instance. */
export type RunObserver = (status: BackgroundTaskStatus) => Promise<void>;

/** A run may last its interval, never more than ten minutes (ADM-N47). */
export const MAX_RUN_MS = 10 * 60 * 1000;

/**
 * Why a run failed, or null when it succeeded. This is the contract of every
 * task (ADM-N52): a run fails by throwing, or by answering a ResponseModel
 * that carries an error. A task that meets errors on part of its work, one
 * repository out of five for instance, must fail at the end of its pass:
 * otherwise it counts as a success and no alert is sent.
 */
const failureOf = (result: unknown): string | null => {
  if (result instanceof ResponseModel && result.errorCode) {
    return result.message ?? `error ${result.errorCode}`;
  }
  return null;
};

/** The settled run, or this mark when its time limit came first. */
const TIMED_OUT = Symbol("timed out");

/** "45 s", "10 min". */
const durationOf = (ms: number): string =>
  ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

export interface RepeatingTaskOptions {
  observer?: RunObserver;
  now?: () => Date;
  /** The time limit of a run; by default its interval, ten minutes at most. */
  timeoutMs?: number;
  /** False for the tasks run every few seconds, whose start would flood the log. */
  logRuns?: boolean;
}

/**
 * A task run at a fixed interval, which a configuration change can move
 * without a restart (EV-18). A failed run is logged and the next one still
 * happens. The state of the runs is kept for the monitoring page (ADM-N34).
 *
 * A run is never started while the previous one is still going (ADM-N37).
 * A run that goes past its time limit fails, and every turn skipped while it
 * still holds the task fails too (ADM-N47); a turn skipped within the limit
 * is only logged. A run that never ends then
 * reaches the alerts instead of stopping the task without a word. A promise
 * cannot be cancelled: the next run waits until the stuck one settles, and
 * the result of a run that timed out is dropped.
 */
export class RepeatingTask {
  private readonly observer?: RunObserver;
  private readonly now: () => Date;
  private readonly timeoutMs?: number;
  private readonly logRuns: boolean;
  private timer: NodeJS.Timeout | undefined;
  private runningSince: Date | null = null;
  private stuck = false;
  private lastRunAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private consecutiveFailures = 0;

  public constructor(
    private readonly name: string,
    private readonly run: () => Promise<unknown>,
    private intervalMs: number,
    {
      observer,
      now = () => new Date(),
      timeoutMs,
      logRuns = true,
    }: RepeatingTaskOptions = {},
  ) {
    this.observer = observer;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.logRuns = logRuns;
  }

  public getIntervalMs(): number {
    return this.intervalMs;
  }

  /** Takes the new interval; a started task counts it from now. */
  public setIntervalMs(intervalMs: number): void {
    if (intervalMs === this.intervalMs) return;
    this.intervalMs = intervalMs;
    logger.info(`${this.name}: interval set to ${intervalMs} ms`);
    if (this.timer) this.schedule();
  }

  public start(): void {
    if (!this.timer) this.schedule();
  }

  public stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** The state of the runs since the service started. */
  public status(): BackgroundTaskStatus {
    return {
      name: this.name,
      intervalMs: this.intervalMs,
      running: this.runningSince !== null,
      runningSince: this.runningSince,
      stuck: this.stuck,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /** Runs the task once now, logged like the other runs. */
  public runNow(): Promise<void> {
    return this.runOnce();
  }

  private schedule(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.runOnce(), this.intervalMs);
  }

  private limitMs(): number {
    return this.timeoutMs ?? Math.min(this.intervalMs, MAX_RUN_MS);
  }

  private async runOnce(): Promise<void> {
    if (this.runningSince) {
      logger.warn(`${this.name}: previous run still going, this one skipped`);
      // Within its time limit a long run is no failure; past it, each turn is
      if (this.stuck) {
        await this.record(
          `still running since ${this.runningSince.toISOString()}`,
        );
      }
      return;
    }
    const startedAt = this.now();
    this.runningSince = startedAt;
    this.lastRunAt = startedAt;
    if (this.logRuns) logger.info(`${this.name}: running...`);

    // A run that throws at once is a failure like a rejected one
    const outcome = Promise.resolve()
      .then(() => this.run())
      .then(failureOf, errorMessage);
    const limitMs = this.limitMs();
    const failure = await this.within(outcome, limitMs);
    if (failure === TIMED_OUT) {
      this.stuck = true;
      // The task is free again once the stuck run settles
      void outcome.finally(() => this.release(startedAt));
      await this.record(`did not end within ${durationOf(limitMs)}`);
      return;
    }
    this.release(startedAt);
    await this.record(failure);
  }

  /** The outcome, or TIMED_OUT when it takes longer than limitMs. */
  private async within(
    outcome: Promise<string | null>,
    limitMs: number,
  ): Promise<string | null | typeof TIMED_OUT> {
    let limit: NodeJS.Timeout | undefined;
    const timedOut = new Promise<typeof TIMED_OUT>((resolve) => {
      limit = setTimeout(() => resolve(TIMED_OUT), limitMs);
    });
    try {
      return await Promise.race([outcome, timedOut]);
    } finally {
      clearTimeout(limit);
    }
  }

  private release(startedAt: Date): void {
    if (this.runningSince !== startedAt) return;
    this.runningSince = null;
    this.stuck = false;
  }

  private async record(failure: string | null): Promise<void> {
    if (failure === null) {
      this.lastSuccessAt = this.now();
      this.consecutiveFailures = 0;
    } else {
      this.lastFailureAt = this.now();
      this.consecutiveFailures += 1;
      logger.err(`${this.name} failed: ${failure}`);
    }
    await this.tellObserver();
  }

  private async tellObserver(): Promise<void> {
    if (!this.observer) return;
    try {
      await this.observer(this.status());
    } catch (e) {
      logger.err(`${this.name}: state not followed: ${errorMessage(e)}`);
    }
  }
}
