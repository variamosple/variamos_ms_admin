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
  // Key of the send: sent again with it, it reaches each recipient once
  // (EV-99, CA-NT-05)
  eventId?: string;
}

/** Sends a notification through the notification service. */
export interface INotificationDispatcher {
  dispatchNotification(payload: NotificationPayload): Promise<void>;
}
