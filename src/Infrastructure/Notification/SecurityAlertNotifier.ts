import type {
  ISecurityAlertNotifier,
  SecurityAlert,
  SecurityAlertRecipient,
} from "#src/Domain/Activity/SecurityAlerts.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { INotificationDispatcher } from "#src/Domain/Notification/INotificationDispatcher.js";

/**
 * Both channels (T-24): an in-app notification, seen at once by a signed-in
 * administrator, and a mail, read even when nobody is signed in. A channel
 * that fails is logged and does not stop the other. The generic admin_alert
 * template already exists in the notification service.
 */
export class SecurityAlertNotifier implements ISecurityAlertNotifier {
  public constructor(
    private readonly dispatcher: INotificationDispatcher,
    private readonly mailService: Pick<IMailService, "sendSecurityAlertMail">,
    private readonly logger: ILogger,
  ) {}

  public async notify(
    recipients: SecurityAlertRecipient[],
    alert: SecurityAlert,
  ): Promise<void> {
    const attempt = async (send: () => Promise<unknown>) => {
      try {
        await send();
      } catch (error) {
        this.logger.err(error);
      }
    };
    await Promise.all([
      attempt(() =>
        this.dispatcher.dispatchNotification({
          recipients: { userIds: recipients.map(({ userId }) => userId) },
          templateKey: "admin_alert",
          variables: { title: alert.title, body: alert.body },
          metadata: { source: "security-alerts", rule: alert.rule },
          actorId: null,
        }),
      ),
      ...recipients.flatMap(({ email }) =>
        email
          ? [
              attempt(() =>
                this.mailService.sendSecurityAlertMail(
                  email,
                  alert.title,
                  alert.body,
                ),
              ),
            ]
          : [],
      ),
    ]);
  }
}
