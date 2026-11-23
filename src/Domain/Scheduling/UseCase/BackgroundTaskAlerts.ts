import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { SERVICE_ALERT_KEYS } from "#src/Domain/MicroService/Entity/ServiceAlertPolicy.js";
import type { IServiceAlertPolicyProvider } from "#src/Domain/MicroService/Service/ServiceAlertPolicyService.js";
import type {
  IServiceAlertNotifier,
  ServiceAlert,
} from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";
import type { BackgroundTaskStatus } from "../Entity/BackgroundTaskStatus.js";

/** "2026-11-14 09:30 UTC" */
const utcMinute = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** " at 2026-11-14 09:30 UTC" */
const atUtcMinute = (date: Date): string => ` at ${utcMinute(date)}`;

/** The text of the mail for a task that keeps failing, or works again. */
export function backgroundTaskAlertOf(
  status: BackgroundTaskStatus,
): ServiceAlert {
  if (status.consecutiveFailures === 0) {
    const at = status.lastSuccessAt ? atUtcMinute(status.lastSuccessAt) : "";
    return {
      title: `${status.name} works again`,
      body: `The background task "${status.name}" of the administration succeeded again${at}.`,
    };
  }
  const since = status.lastSuccessAt
    ? `its last success was at ${utcMinute(status.lastSuccessAt)}`
    : "it has not succeeded since the service started";
  return {
    title: `${status.name} keeps failing`,
    body: `The background task "${status.name}" of the administration failed ${status.consecutiveFailures} times in a row; ${since}. The cause is in the log of variamos_ms_admin, and the state of the tasks on the monitoring page.`,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The failures in a row before an alert (ADM-N50): the configured number,
 * but never more than the runs of an hour, so that a task run once a day
 * alerts at its first failure instead of after three days.
 */
export function failuresBeforeAlertOf(
  configured: number,
  intervalMs: number,
): number {
  const runsInAnHour = Math.floor(HOUR_MS / Math.max(intervalMs, 1));
  return Math.max(1, Math.min(configured, runsInAnHour));
}

/**
 * Sends a mail when a background task fails as many times in a row as the
 * monitoring.alerts.failures_before_alert key says, an hour of runs at most,
 * then when it succeeds again (ADM-N34). The same failure is not sent twice.
 *
 * A task is marked as reported only once a mail went out (ADM-N49): when
 * every mail fails, a mail server down for instance, the alert goes again
 * after the next run. Without a recipient, the failures are still followed,
 * so that an address set later is not sent an old failure.
 */
export class BackgroundTaskAlerts {
  /** The tasks reported as failing, by name. */
  private readonly failing = new Set<string>();

  public constructor(
    private readonly policyProvider: IServiceAlertPolicyProvider,
    private readonly notifier: IServiceAlertNotifier,
    private readonly logger: ILogger,
  ) {}

  /** Called after each run of a task, with its state after the run. */
  public async afterRun(status: BackgroundTaskStatus): Promise<void> {
    const wasFailing = this.failing.has(status.name);
    if (status.consecutiveFailures === 0) {
      if (!wasFailing) return;
      if (await this.send(backgroundTaskAlertOf(status))) {
        this.failing.delete(status.name);
      }
      return;
    }
    if (wasFailing) return;
    const policy = await this.policyProvider.getPolicy();
    const threshold = failuresBeforeAlertOf(
      policy.failuresBeforeAlert,
      status.intervalMs,
    );
    if (status.consecutiveFailures < threshold) return;
    if (await this.send(backgroundTaskAlertOf(status), policy.recipients)) {
      this.failing.add(status.name);
    }
  }

  /** True once the alert is dealt with: sent, or no address to send it to. */
  private async send(
    alert: ServiceAlert,
    known?: readonly string[],
  ): Promise<boolean> {
    this.logger.warn(`Background task alert: ${alert.title}`);
    const recipients =
      known ?? (await this.policyProvider.getPolicy()).recipients;
    if (recipients.length === 0) {
      this.logger.info(
        `Background task alert not sent, no address in ${SERVICE_ALERT_KEYS.recipients}: ${alert.title}`,
      );
      return true;
    }
    const sent = await this.notifier.notify(recipients, alert);
    if (sent > 0) return true;
    this.logger.warn(
      `Background task alert to send again after the next run: ${alert.title}`,
    );
    return false;
  }
}
