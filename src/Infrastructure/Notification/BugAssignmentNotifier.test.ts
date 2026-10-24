import { mock } from "vitest-mock-extended";
import { BugAssignmentNotifier } from "./BugAssignmentNotifier.js";
import type { NotificationClient } from "./NotificationClient.js";

describe("BugAssignmentNotifier", () => {
  it("sends an in-app admin alert to the new assignees only", async () => {
    const client = mock<NotificationClient>();
    client.dispatchNotification.mockResolvedValue();

    await new BugAssignmentNotifier(client).notifyAssigned(
      ["u-ben"],
      "Crash on save",
      "actor-1",
    );

    expect(client.dispatchNotification).toHaveBeenCalledWith({
      recipients: { userIds: ["u-ben"] },
      templateKey: "admin_alert",
      variables: {
        title: "Bug assigned to you",
        body: 'You have been assigned to the bug "Crash on save".',
      },
      metadata: { source: "bug-tracker" },
      actorId: "actor-1",
    });
  });
});
