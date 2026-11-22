import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { BackgroundTaskStatus } from "#src/Domain/Scheduling/Entity/BackgroundTaskStatus.js";

/** Told of the state of the task after each run, an alert for instance. */
export type RunObserver = (status: BackgroundTaskStatus) => Promise<void>;

/** Why a run failed: a thrown error, or an answer that carries an error. */
const failureOf = (result: unknown): string | null => {
  if (result instanceof ResponseModel && result.errorCode) {
    return result.message ?? `error ${result.errorCode}`;
  }
  return null;
};

/**
 * A task run at a fixed interval, which a configuration change can move
 * without a restart (EV-18). A failed run is logged and the next one still
 * happens. A run is skipped while the previous one is still going
 * (ADM-N37), and the state of the runs is kept for the monitoring page
 * (ADM-N34).
 */
export interface RepeatingTaskOptions {
  observer?: RunObserver;
  now?: () => Date;
}

export class RepeatingTask {
  private readonly observer?: RunObserver;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private consecutiveFailures = 0;

  public constructor(
    private readonly name: string,
    private readonly run: () => Promise<unknown>,
    private intervalMs: number,
    { observer, now = () => new Date() }: RepeatingTaskOptions = {},
  ) {
    this.observer = observer;
    this.now = now;
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
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  private schedule(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.runOnce(), this.intervalMs);
  }

  /** Runs the task once now, logged like the other runs. */
  public runNow(): Promise<void> {
    return this.runOnce();
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      logger.warn(`${this.name}: previous run still going, this one skipped`);
      return;
    }
    this.running = true;
    this.lastRunAt = this.now();
    let failure: string | null;
    try {
      logger.info(`${this.name}: running...`);
      failure = failureOf(await this.run());
    } catch (e) {
      failure = errorMessage(e);
    } finally {
      this.running = false;
    }
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
