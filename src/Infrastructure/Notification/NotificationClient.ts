import axios from "axios";
import EnvVars from "#src/common/EnvVars.js";
import logger from "#src/common/logger.js";
import type {
  INotificationDispatcher,
  NotificationPayload,
} from "#src/Domain/Notification/INotificationDispatcher.js";
import { httpFailure } from "#src/Infrastructure/Http/httpFailure.js";

export class NotificationClient implements INotificationDispatcher {
  private readonly baseUrl = EnvVars.NOTIFICATION.SERVICE_URL;
  private readonly internalToken = EnvVars.NOTIFICATION.INTERNAL_TOKEN;

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

export const NotificationClientInstance = new NotificationClient();
