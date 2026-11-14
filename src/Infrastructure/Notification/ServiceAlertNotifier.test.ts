import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import { ServiceAlertNotifier } from "./ServiceAlertNotifier.js";

const ALERT = {
  title: "variamos_ms_languages is down",
  body: "variamos_ms_languages did not answer 3 health checks in a row.",
};

function setup() {
  const mail = mock<Pick<IMailService, "sendServiceAlertMail">>();
  mail.sendServiceAlertMail.mockResolvedValue(true);
  const logger = mock<ILogger>();
  return { mail, logger, notifier: new ServiceAlertNotifier(mail, logger) };
}

describe("ServiceAlertNotifier", () => {
  it("sends the alert to every address", async () => {
    const { mail, logger, notifier } = setup();

    await notifier.notify(["a@example.com", "b@example.com"], ALERT);

    expect(mail.sendServiceAlertMail).toHaveBeenCalledWith(
      "a@example.com",
      ALERT.title,
      ALERT.body,
    );
    expect(mail.sendServiceAlertMail).toHaveBeenCalledWith(
      "b@example.com",
      ALERT.title,
      ALERT.body,
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Service alert "${ALERT.title}" sent to 2 of 2 address(es)`,
    );
  });

  it("goes on when a mail fails, and warns", async () => {
    const { mail, logger, notifier } = setup();
    mail.sendServiceAlertMail
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await notifier.notify(
      ["a@example.com", "b@example.com", "c@example.com"],
      ALERT,
    );

    expect(mail.sendServiceAlertMail).toHaveBeenCalledTimes(3);
    expect(logger.err).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      `Service alert "${ALERT.title}" sent to 1 of 3 address(es)`,
    );
  });
});
