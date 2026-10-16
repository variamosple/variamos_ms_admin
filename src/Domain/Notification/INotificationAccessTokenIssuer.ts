export interface NotificationAccessToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issues the short-lived token a signed-in user presents to the notification
 * service (ADR-0001).
 */
export interface INotificationAccessTokenIssuer {
  issue(userId: string): Promise<NotificationAccessToken>;
}
