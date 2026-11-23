import nodemailer from "nodemailer";
import logger from "#src/common/logger.js";
import { MAIL_RETRY } from "./MailRetryQueue.js";
import { MailServiceImpl } from "./MailService.js";

// Production: the mails leave through the SMTP server
const settings = {
  host: "smtp.example.com",
  port: 587,
  user: "mailer",
  password: "not-a-real-password",
  from: '"VariaMos" <noreply@example.com>',
  production: true,
};

/** A failed mail waits for another attempt; /health shows it (ADM-N35). */
describe("MailServiceImpl, a mail server that does not answer", () => {
  let sendMail: ReturnType<typeof vi.fn>;
  let service: MailServiceImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "err").mockImplementation(() => {});
    sendMail = vi.fn();
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail,
    } as never);
    service = new MailServiceImpl(settings);
  });

  afterEach(() => {
    service.stopRetries();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends the HTML with its plain-text version", async () => {
    sendMail.mockResolvedValue({ messageId: "m-1" });

    const sent = await service.sendPasswordResetMail(
      "alice@example.com",
      "https://app.example.com/reset?token=abc",
      60 * 60 * 1000,
    );

    expect(sent).toBe(true);
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        from: settings.from,
        to: "alice@example.com",
        html: expect.stringContaining("<a href="),
        text: expect.stringContaining(
          "Reset Password (https://app.example.com/reset?token=abc)",
        ),
      }),
    );
  });

  it("answers false at once, then sends the mail a minute later", async () => {
    sendMail
      .mockRejectedValueOnce(new Error("connect ETIMEDOUT"))
      .mockResolvedValueOnce({ messageId: "m-2" });

    const sent = await service.sendMfaResetMail("alice@example.com");

    expect(sent).toBe(false);
    expect(service.deliveryStatus().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(MAIL_RETRY.delaysMs[0] ?? 0);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[1]).toEqual(sendMail.mock.calls[0]);
    expect(service.deliveryStatus()).toEqual({
      pending: 0,
      abandoned: 0,
      lastAbandonedAt: null,
    });
  });

  it("stops the waiting mails at shutdown", async () => {
    sendMail.mockRejectedValue(new Error("connect ETIMEDOUT"));
    await service.sendMfaResetMail("alice@example.com");

    service.stopRetries();
    await vi.runAllTimersAsync();

    expect(sendMail).toHaveBeenCalledOnce();
    expect(service.deliveryStatus().pending).toBe(0);
  });
});
