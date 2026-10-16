import { decodeProtectedHeader, jwtVerify } from "jose";
import {
  deriveNotificationTokenKey,
  NOTIFICATION_TOKEN_AUDIENCE,
  NOTIFICATION_TOKEN_ISSUER,
  NotificationAccessTokenIssuer,
} from "./NotificationAccessTokenIssuer.js";

const INTERNAL_TOKEN = "shared-internal-token";

describe("deriveNotificationTokenKey", () => {
  // Same vector in variamos_ms_notifications: both services must derive the
  // same key, or no token can be verified.
  it("matches the key derivation shared with the notification service", () => {
    expect(
      Buffer.from(deriveNotificationTokenKey(INTERNAL_TOKEN)).toString("hex"),
    ).toBe("a141d7e250e89f6f00473e7948c2b8eb3780a0820e9f32c9513b70ca8e2d5058");
  });
});

describe("NotificationAccessTokenIssuer", () => {
  it("issues an HS256 token for the user, checked with the derived key", async () => {
    const issuer = new NotificationAccessTokenIssuer(INTERNAL_TOKEN);

    const { token } = await issuer.issue("user-42");

    const { payload } = await jwtVerify(
      token,
      deriveNotificationTokenKey(INTERNAL_TOKEN),
      {
        issuer: NOTIFICATION_TOKEN_ISSUER,
        audience: NOTIFICATION_TOKEN_AUDIENCE,
        algorithms: ["HS256"],
      },
    );
    expect(payload.sub).toBe("user-42");
    expect(decodeProtectedHeader(token).alg).toBe("HS256");
  });

  it("expires after 15 minutes", async () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const issuer = new NotificationAccessTokenIssuer(
      INTERNAL_TOKEN,
      undefined,
      () => now,
    );

    const { token, expiresAt } = await issuer.issue("user-42");

    expect(expiresAt.toISOString()).toBe("2026-10-16T12:15:00.000Z");
    const { payload } = await jwtVerify(
      token,
      deriveNotificationTokenKey(INTERNAL_TOKEN),
      { currentDate: new Date("2026-10-16T12:14:59Z") },
    );
    expect(payload.exp).toBe(expiresAt.getTime() / 1000);
    await expect(
      jwtVerify(token, deriveNotificationTokenKey(INTERNAL_TOKEN), {
        currentDate: new Date("2026-10-16T12:15:01Z"),
      }),
    ).rejects.toThrow();
  });

  it("is refused with a key derived from another secret", async () => {
    const { token } = await new NotificationAccessTokenIssuer(
      INTERNAL_TOKEN,
    ).issue("user-42");

    await expect(
      jwtVerify(token, deriveNotificationTokenKey("other-secret")),
    ).rejects.toThrow();
  });

  it("never signs with the internal token itself", async () => {
    const { token } = await new NotificationAccessTokenIssuer(
      INTERNAL_TOKEN,
    ).issue("user-42");

    await expect(
      jwtVerify(token, new TextEncoder().encode(INTERNAL_TOKEN)),
    ).rejects.toThrow();
  });

  it("refuses to start without an internal token", () => {
    expect(() => new NotificationAccessTokenIssuer("")).toThrow(
      "The notification internal token is not configured.",
    );
  });

  it("refuses to issue a token without a user id", async () => {
    await expect(
      new NotificationAccessTokenIssuer(INTERNAL_TOKEN).issue(""),
    ).rejects.toThrow();
  });
});
