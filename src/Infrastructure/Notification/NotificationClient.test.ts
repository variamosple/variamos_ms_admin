import axios from "axios";
import { NotificationClient } from "./NotificationClient.js";

vi.mock("#src/common/logger.js");

// The client posts where its settings say, with their token (EV-05)
describe("NotificationClient", () => {
  const client = new NotificationClient({
    serviceUrl: "http://notifications.test",
    internalToken: "internal-token",
  });
  const payload = {
    eventId: "e1",
    type: "info",
    title: "Title",
    message: "Message",
    recipients: { userIds: ["u1"] },
  } as never;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the notification to the service with the internal token", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} });

    await client.dispatchNotification(payload);

    expect(post).toHaveBeenCalledWith(
      "http://notifications.test/notifications",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": "internal-token",
        },
      },
    );
  });

  it("fails when the service does not take it", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refused"));

    await expect(client.dispatchNotification(payload)).rejects.toThrow(
      "Failed to dispatch notification to the notification service.",
    );
  });
});
