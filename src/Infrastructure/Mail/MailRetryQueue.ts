import logger from "#src/common/logger.js";
import { maskEmail } from "#src/common/maskEmail.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";

/** A mail ready to leave, in HTML and in plain text. */
export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** What GET /health shows of the mails (ADM-N35). */
export interface MailDeliveryStatus {
  /** Mails that failed and wait for their next attempt. */
  pending: number;
  /** Mails given up since the start of the service. */
  abandoned: number;
  lastAbandonedAt: string | null;
}

/**
 * A failed mail is tried again 1 minute, then 5 minutes later: three
 * attempts in all. The mails wait in memory only: a reset link is never
 * written to the database, and a restart drops them (ADM-N35).
 */
export const MAIL_RETRY = {
  delaysMs: [60_000, 300_000],
  maxPending: 200,
};

/**
 * An SMTP answer in the 5xx range is final: the address or the account is
 * refused, and the same mail would be refused again.
 */
const isFinal = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if (!("responseCode" in error)) return false;
  const code = error.responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
};

/** Tries the failed mails again later, then gives up and counts them. */
export class MailRetryQueue {
  private readonly waiting = new Set<NodeJS.Timeout>();
  private abandoned = 0;
  private lastAbandonedAt: Date | null = null;

  public constructor(
    private readonly deliver: (mail: OutgoingMail) => Promise<void>,
    private readonly limits = MAIL_RETRY,
  ) {}

  /** The attempt `attempt` of the mail failed (1 is the first). */
  public failed(mail: OutgoingMail, error: unknown, attempt = 1): void {
    const to = maskEmail(mail.to);
    const reason = errorMessage(error);
    const delayMs = this.limits.delaysMs[attempt - 1];
    if (isFinal(error) || delayMs === undefined) {
      this.giveUp(`to ${to} after ${attempt} attempt(s): ${reason}`);
      return;
    }
    if (this.waiting.size >= this.limits.maxPending) {
      this.giveUp(`to ${to}: ${this.waiting.size} mails already waiting`);
      return;
    }
    logger.warn(
      `[MAIL] Not sent to ${to} (attempt ${attempt}), tried again in ${delayMs / 1000} s: ${reason}`,
    );
    const timer = setTimeout(() => {
      this.waiting.delete(timer);
      void this.tryAgain(mail, attempt + 1);
    }, delayMs);
    timer.unref();
    this.waiting.add(timer);
  }

  public status(): MailDeliveryStatus {
    return {
      pending: this.waiting.size,
      abandoned: this.abandoned,
      lastAbandonedAt: this.lastAbandonedAt?.toISOString() ?? null,
    };
  }

  /** At shutdown: the waiting mails are dropped, and counted in the log. */
  public stop(): void {
    const dropped = this.waiting.size;
    for (const timer of this.waiting) clearTimeout(timer);
    this.waiting.clear();
    if (dropped > 0) {
      logger.warn(`[MAIL GAVE UP] ${dropped} mail(s) waiting at shutdown`);
    }
  }

  private async tryAgain(mail: OutgoingMail, attempt: number): Promise<void> {
    try {
      await this.deliver(mail);
      logger.info(
        `[MAIL] Email sent to ${maskEmail(mail.to)} on attempt ${attempt}`,
      );
    } catch (error) {
      this.failed(mail, error, attempt);
    }
  }

  private giveUp(detail: string): void {
    this.abandoned += 1;
    this.lastAbandonedAt = new Date();
    logger.err(`[MAIL GAVE UP] Not sent ${detail}`);
  }
}
