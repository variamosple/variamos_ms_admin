export interface NotificationPayload {
  recipients: {
    userIds?: string[];
    roles?: string[];
  };
  templateKey: string;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
  // Delivered whatever the recipients muted in their preferences (EV-99)
  mandatory?: boolean;
}

/** Sends a notification through the notification service. */
export interface INotificationDispatcher {
  dispatchNotification(payload: NotificationPayload): Promise<void>;
}
