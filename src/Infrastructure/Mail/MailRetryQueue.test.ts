import logger from "#src/common/logger.js";
import {
  MAIL_RETRY,
  MailRetryQueue,
  type OutgoingMail,
} from "./MailRetryQueue.js";

const mail: OutgoingMail = {
  to: "alice@example.com",
  subject: "VariaMos - Password Recovery Request",
  html: "<p>Reset</p>",
  text: "Reset",
};
const connectionRefused = Object.assign(new Error("connect ECONNREFUSED"), {
  code: "ECONNREFUSED",
});
const mailboxRefused = Object.assign(new Error("550 No such user"), {
  responseCode: 550,
});
const [FIRST_DELAY_MS, SECOND_DELAY_MS] = MAIL_RETRY.delaysMs as [
  number,
  number,
];

/** Three attempts, then given up and counted (ADM-N35). */
describe("MailRetryQueue", () => {
  let deliver: ReturnType<typeof vi.fn<(mail: OutgoingMail) => Promise<void>>>;
  let queue: MailRetryQueue;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00Z") });
    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    err = vi.spyOn(logger, "err").mockImplementation(() => {});
    deliver = vi.fn<(mail: OutgoingMail) => Promise<void>>();
    queue = new MailRetryQueue(deliver);
  });

  afterEach(() => {
    queue.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("tries again after 1 minute, and stops once the mail leaves", async () => {
    deliver.mockResolvedValue();

    queue.failed(mail, connectionRefused);
    expect(queue.status().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS - 1);
    expect(deliver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(deliver).toHaveBeenCalledExactlyOnceWith(mail);
    expect(queue.status()).toEqual({
      pending: 0,
      abandoned: 0,
      lastAbandonedAt: null,
    });
    await vi.advanceTimersByTimeAsync(SECOND_DELAY_MS);
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("gives up after the third attempt, and counts it", async () => {
    deliver.mockRejectedValue(connectionRefused);

    queue.failed(mail, connectionRefused);
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS);
    expect(queue.status().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(SECOND_DELAY_MS);

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(queue.status()).toEqual({
      pending: 0,
      abandoned: 1,
      lastAbandonedAt: "2026-11-23T10:06:00.000Z",
    });
    expect(err).toHaveBeenCalledExactlyOnceWith(
      "[MAIL GAVE UP] Not sent to a***@example.com after 3 attempt(s): connect ECONNREFUSED",
    );
  });

  it("does not try again a mail the server refused for good", () => {
    queue.failed(mail, mailboxRefused);

    expect(queue.status()).toMatchObject({ pending: 0, abandoned: 1 });
    expect(err).toHaveBeenCalledExactlyOnceWith(
      "[MAIL GAVE UP] Not sent to a***@example.com after 1 attempt(s): 550 No such user",
    );
  });

  it("gives up at once when too many mails wait", () => {
    const small = new MailRetryQueue(deliver, { ...MAIL_RETRY, maxPending: 1 });

    small.failed(mail, connectionRefused);
    small.failed(mail, connectionRefused);

    expect(small.status()).toMatchObject({ pending: 1, abandoned: 1 });
    expect(err).toHaveBeenCalledExactlyOnceWith(
      "[MAIL GAVE UP] Not sent to a***@example.com: 1 mails already waiting",
    );
    small.stop();
  });

  it("never logs the content of the mail nor the full address", async () => {
    deliver.mockRejectedValue(connectionRefused);
    queue.failed(
      { ...mail, html: "token=reset-token-value" },
      connectionRefused,
    );
    await vi.runAllTimersAsync();

    const logged = JSON.stringify([
      vi.mocked(logger.warn).mock.calls,
      err.mock.calls,
    ]);
    expect(logged).not.toContain("reset-token-value");
    expect(logged).not.toContain("alice@example.com");
  });

  it("drops the waiting mails at shutdown, and says how many", async () => {
    queue.failed(mail, connectionRefused);
    queue.failed(mail, connectionRefused);

    queue.stop();
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS + SECOND_DELAY_MS);

    expect(deliver).not.toHaveBeenCalled();
    expect(queue.status().pending).toBe(0);
    expect(logger.warn).toHaveBeenLastCalledWith(
      "[MAIL GAVE UP] 2 mail(s) waiting at shutdown",
    );
  });
});
