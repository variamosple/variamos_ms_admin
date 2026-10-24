import type { IBugAssignmentNotifier } from "#src/Domain/Bug/Service/IBugAssignmentNotifier.js";
import type { NotificationClient } from "./NotificationClient.js";

// The generic admin_alert template already exists in the notification
// service: no new template row to create in production
export class BugAssignmentNotifier implements IBugAssignmentNotifier {
  public constructor(private readonly client: NotificationClient) {}

  public notifyAssigned(
    userIds: string[],
    bugTitle: string,
    actorId?: string,
  ): Promise<void> {
    return this.client.dispatchNotification({
      recipients: { userIds },
      templateKey: "admin_alert",
      variables: {
        title: "Bug assigned to you",
        body: `You have been assigned to the bug "${bugTitle}".`,
      },
      metadata: { source: "bug-tracker" },
      actorId: actorId ?? null,
    });
  }
}
