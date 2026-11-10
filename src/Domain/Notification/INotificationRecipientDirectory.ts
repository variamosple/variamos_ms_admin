/** Accounts a notification can reach: active, enabled and not deleted. */
export interface INotificationRecipientDirectory {
  activeUserIds(): Promise<string[]>;
  /** Each account once, even when it holds several of the roles. */
  activeUserIdsWithRoles(roles: string[]): Promise<string[]>;
}
