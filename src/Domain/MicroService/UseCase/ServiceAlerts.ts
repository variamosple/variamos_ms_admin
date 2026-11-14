import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { MicroServiceHealthInfo } from "../Entity/MicroServiceHealth.js";
import { SERVICE_ALERT_KEYS } from "../Entity/ServiceAlertPolicy.js";
import type { IServiceAlertPolicyProvider } from "../Service/ServiceAlertPolicyService.js";
import {
  type OutageEvent,
  ServiceOutageTracker,
} from "../Service/ServiceOutageTracker.js";

export interface ServiceAlert {
  title: string;
  body: string;
}

export interface IServiceAlertNotifier {
  notify(recipients: readonly string[], alert: ServiceAlert): Promise<void>;
}

const MINUTE_MS = 60 * 1000;

/** "2026-11-14 09:30 UTC" */
const utcMinute = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

const durationOf = (ms: number): string => {
  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
};

/** The text of the mail for a service reported down or back. */
export function alertOf(event: OutageEvent): ServiceAlert {
  if (event.kind === "recovered") {
    return {
      title: `${event.serviceName} is back`,
      body: `${event.serviceName} answers its health checks again, after ${durationOf(event.at.getTime() - event.since.getTime())} without an answer (since ${utcMinute(event.since)}).`,
    };
  }
  const reason = event.reason ? ` Last reason: ${event.reason}.` : "";
  return {
    title: `${event.serviceName} is down`,
    body: `${event.serviceName} did not answer ${event.failures} health checks in a row, since ${utcMinute(event.since)}.${reason} Its state is on the monitoring page of the administration.`,
  };
}

/**
 * Sends a mail when a service stops answering its health checks, and when
 * it answers again. Without a recipient on the configuration screen, the
 * outages are still followed, so that an alert set later is not sent for an
 * outage reported long ago.
 */
export class ServiceAlerts {
  public constructor(
    private readonly policyProvider: IServiceAlertPolicyProvider,
    private readonly notifier: IServiceAlertNotifier,
    private readonly logger: ILogger,
    private readonly tracker = new ServiceOutageTracker(),
  ) {}

  public async onHealthCheck(check: MicroServiceHealthInfo): Promise<void> {
    const policy = await this.policyProvider.getPolicy();
    const event = this.tracker.observe(check, policy.failuresBeforeAlert);
    if (!event) return;
    const alert = alertOf(event);
    if (policy.recipients.length === 0) {
      this.logger.info(
        `Service alert not sent, no address in ${SERVICE_ALERT_KEYS.recipients}: ${alert.title}`,
      );
      return;
    }
    await this.notifier.notify(policy.recipients, alert);
  }
}
