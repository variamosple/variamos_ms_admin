import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type {
  IServiceAlertNotifier,
  ServiceAlert,
} from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";

/**
 * One mail per address of the monitoring alerts. A mail that fails is logged
 * and does not stop the others.
 */
export class ServiceAlertNotifier implements IServiceAlertNotifier {
  public constructor(
    private readonly mailService: Pick<IMailService, "sendServiceAlertMail">,
    private readonly logger: ILogger,
  ) {}

  public async notify(
    recipients: readonly string[],
    alert: ServiceAlert,
  ): Promise<void> {
    const outcomes = await Promise.allSettled(
      recipients.map((to) =>
        this.mailService.sendServiceAlertMail(to, alert.title, alert.body),
      ),
    );
    const sent = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value,
    ).length;
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") this.logger.err(outcome.reason);
    }
    const message = `Service alert "${alert.title}" sent to ${sent} of ${recipients.length} address(es)`;
    if (sent === recipients.length) this.logger.info(message);
    else this.logger.warn(message);
  }
}
