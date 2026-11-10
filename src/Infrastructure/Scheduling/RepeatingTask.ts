import logger from "#src/common/logger.js";

/**
 * A task run at a fixed interval, which a configuration change can move
 * without a restart (EV-18). A failed run is logged and the next one still
 * happens.
 */
export class RepeatingTask {
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly name: string,
    private readonly run: () => Promise<unknown>,
    private intervalMs: number,
  ) {}

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

  private schedule(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.runOnce(), this.intervalMs);
  }

  private async runOnce(): Promise<void> {
    try {
      logger.info(`${this.name}: running...`);
      await this.run();
    } catch (e) {
      logger.err(`${this.name} failed: ${(e as Error).message}`);
    }
  }
}
