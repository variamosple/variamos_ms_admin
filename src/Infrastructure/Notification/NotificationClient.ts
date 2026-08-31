import EnvVars from "@src/common/EnvVars.js";
import axios from "axios";
import logger from "jet-logger";

export interface DispatchNotificationPayload {
  recipients: {
    userIds?: string[];
    roles?: string[];
  };
  templateKey: string;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
}

export class NotificationClient {
  private readonly baseUrl = EnvVars.NOTIFICATION.SERVICE_URL;
  private readonly internalToken = EnvVars.NOTIFICATION.INTERNAL_TOKEN;

  public async dispatchNotification(
    payload: DispatchNotificationPayload,
  ): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/notifications`, payload, {
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": this.internalToken,
        },
      });
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logger.err("Failed to dispatch notification via NotificationClient:");
      logger.err(err.response?.data || err.message || err);
      throw new Error(
        "Failed to dispatch notification to the notification service.",
      );
    }
  }
}

export const NotificationClientInstance = new NotificationClient();
