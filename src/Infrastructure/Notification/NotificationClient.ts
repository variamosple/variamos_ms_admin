import axios from "axios";
import logger from "#src/common/logger.js";
import type {
  INotificationDispatcher,
  NotificationPayload,
} from "#src/Domain/Notification/INotificationDispatcher.js";
import { httpFailure } from "#src/Infrastructure/Http/httpFailure.js";

/** Where the notification service is, and the token it expects (EV-05). */
export interface NotificationClientSettings {
  serviceUrl: string;
  internalToken: string;
  /** Time limit of a dispatch; NOTIFICATIONS_TIMEOUT_MS by default. */
  timeoutMs?: number;
}

/**
 * A notification service that does not answer gives up after 5 s (ADM-N33),
 * rather than holding the request that sends the notification.
 */
const NOTIFICATIONS_TIMEOUT_MS = 5000;

export class NotificationClient implements INotificationDispatcher {
  private readonly baseUrl: string;
  private readonly internalToken: string;
  private readonly timeoutMs: number;

  public constructor({
    serviceUrl,
    internalToken,
    timeoutMs = NOTIFICATIONS_TIMEOUT_MS,
  }: NotificationClientSettings) {
    this.baseUrl = serviceUrl;
    this.internalToken = internalToken;
    this.timeoutMs = timeoutMs;
  }

  public async dispatchNotification(
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/notifications`, payload, {
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": this.internalToken,
        },
        timeout: this.timeoutMs,
      });
    } catch (error: unknown) {
      logger.err("Failed to dispatch notification via NotificationClient:");
      logger.err(httpFailure(error));
      throw new Error(
        "Failed to dispatch notification to the notification service.",
        { cause: error },
      );
    }
  }
}
