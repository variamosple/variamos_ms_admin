import { mock } from "vitest-mock-extended";
import type { SecurityAlert } from "#src/Domain/Activity/SecurityAlerts.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { INotificationDispatcher } from "#src/Domain/Notification/INotificationDispatcher.js";
import { SecurityAlertNotifier } from "./SecurityAlertNotifier.js";

const ALERT: SecurityAlert = {
  rule: "failed-sign-ins",
  target: "account:user-1",
  title: "Repeated failed sign-ins",
  body: "10 failed sign-ins in 15 minutes for account user-1.",
};
const RECIPIENTS = [
  { userId: "top-1", email: "top1@example.com" },
  { userId: "top-2", email: null },
];

function setup() {
  const dispatcher = mock<INotificationDispatcher>();
  const mail = mock<Pick<IMailService, "sendSecurityAlertMail">>();
  mail.sendSecurityAlertMail.mockResolvedValue(true);
  const logger = mock<ILogger>();
  const notifier = new SecurityAlertNotifier(dispatcher, mail, logger);
  return { dispatcher, mail, logger, notifier };
}

describe("SecurityAlertNotifier", () => {
  it("sends an in-app notification to every recipient and a mail to each address", async () => {
    const { dispatcher, mail, notifier } = setup();

    await notifier.notify(RECIPIENTS, ALERT);

    expect(dispatcher.dispatchNotification).toHaveBeenCalledWith({
      recipients: { userIds: ["top-1", "top-2"] },
      templateKey: "admin_alert",
      variables: { title: ALERT.title, body: ALERT.body },
      metadata: { source: "security-alerts", rule: "failed-sign-ins" },
      actorId: null,
    });
    expect(mail.sendSecurityAlertMail).toHaveBeenCalledOnce();
    expect(mail.sendSecurityAlertMail).toHaveBeenCalledWith(
      "top1@example.com",
      ALERT.title,
      ALERT.body,
    );
  });

  it("still sends the mail when the notification service fails", async () => {
    const { dispatcher, mail, logger, notifier } = setup();
    dispatcher.dispatchNotification.mockRejectedValue(new Error("down"));

    await expect(notifier.notify(RECIPIENTS, ALERT)).resolves.toBeUndefined();

    expect(mail.sendSecurityAlertMail).toHaveBeenCalledOnce();
    expect(logger.err).toHaveBeenCalledOnce();
  });

  it("still notifies in the app when a mail fails", async () => {
    const { dispatcher, mail, logger, notifier } = setup();
    mail.sendSecurityAlertMail.mockRejectedValue(new Error("smtp down"));

    await expect(notifier.notify(RECIPIENTS, ALERT)).resolves.toBeUndefined();

    expect(dispatcher.dispatchNotification).toHaveBeenCalledOnce();
    expect(logger.err).toHaveBeenCalledOnce();
  });
});
