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
}

export class NotificationClient implements INotificationDispatcher {
  private readonly baseUrl: string;
  private readonly internalToken: string;

  public constructor({
    serviceUrl,
    internalToken,
  }: NotificationClientSettings) {
    this.baseUrl = serviceUrl;
    this.internalToken = internalToken;
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
