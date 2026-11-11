import { mock } from "vitest-mock-extended";
import type { ScheduledConfigurationChange } from "#src/Domain/Configuration/Entity/ScheduledConfigurationChange.js";
import type { NotificationClient } from "./NotificationClient.js";
import { ScheduledChangeNotifier } from "./ScheduledChangeNotifier.js";

const change = (createdBy: string) =>
  ({
    key: "security.password.min_length",
    newValue: 14,
    dueAt: new Date("2026-11-15T13:00:00Z"),
    createdBy,
  }) as ScheduledConfigurationChange;

describe("ScheduledChangeNotifier (EV-115 lot B)", () => {
  it("tells the author why the change was not applied", async () => {
    const client = mock<NotificationClient>();
    client.dispatchNotification.mockResolvedValue();

    await new ScheduledChangeNotifier(client).notifyNotApplied(
      change("admin-1"),
      "The setting was changed after this change was planned; it was left as it was.",
    );

    expect(client.dispatchNotification).toHaveBeenCalledWith({
      recipients: { userIds: ["admin-1"] },
      templateKey: "admin_alert",
      variables: {
        title: "Planned setting change not applied",
        body: 'The change of "security.password.min_length" to 14, planned for 15 November 2026 at 13:00 UTC, was not applied. The setting was changed after this change was planned; it was left as it was.',
      },
      metadata: { source: "configuration" },
      actorId: null,
    });
  });

  it("tells nobody about a change without an account behind it", async () => {
    const client = mock<NotificationClient>();

    await new ScheduledChangeNotifier(client).notifyNotApplied(
      change("system"),
      "refused",
    );

    expect(client.dispatchNotification).not.toHaveBeenCalled();
  });
});
