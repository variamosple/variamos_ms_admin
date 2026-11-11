import { announcedInstant } from "#src/Domain/Configuration/Entity/AnnouncedConfigurationKeys.js";
import type { ScheduledConfigurationChange } from "#src/Domain/Configuration/Entity/ScheduledConfigurationChange.js";
import type { IScheduledChangeNotifier } from "#src/Domain/Configuration/Service/IScheduledChangeNotifier.js";
import type { NotificationClient } from "./NotificationClient.js";

// No account behind it: nobody to tell
const NO_AUTHOR = "system";

/**
 * Tells the author of a planned change that it was not applied (EV-115
 * lot B), through the generic admin_alert template: no new template row to
 * create in production.
 */
export class ScheduledChangeNotifier implements IScheduledChangeNotifier {
  public constructor(private readonly client: NotificationClient) {}

  public async notifyNotApplied(
    change: ScheduledConfigurationChange,
    reason: string,
  ): Promise<void> {
    if (change.createdBy === NO_AUTHOR) return;
    await this.client.dispatchNotification({
      recipients: { userIds: [change.createdBy] },
      templateKey: "admin_alert",
      variables: {
        title: "Planned setting change not applied",
        body: `The change of "${change.key}" to ${JSON.stringify(change.newValue)}, planned for ${announcedInstant(change.dueAt)}, was not applied. ${reason}`,
      },
      metadata: { source: "configuration" },
      actorId: null,
    });
  }
}
