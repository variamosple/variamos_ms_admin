export interface NotificationPayload {
  recipients: {
    userIds?: string[];
    roles?: string[];
  };
  templateKey: string;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
}

/** Sends a notification through the notification service. */
export interface INotificationDispatcher {
  dispatchNotification(payload: NotificationPayload): Promise<void>;
}
