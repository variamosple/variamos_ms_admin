import { hkdfSync } from "node:crypto";
import { SignJWT } from "jose";
import type {
  INotificationAccessTokenIssuer,
  NotificationAccessToken,
} from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";

// Shared with variamos_ms_notifications, which derives the same key to
// verify the tokens (ADR-0001). Changing one value breaks every token.
export const NOTIFICATION_TOKEN_ISSUER = "variamos_ms_admin";
export const NOTIFICATION_TOKEN_AUDIENCE = "variamos_ms_notifications";
const KEY_SALT = "variamos-notifications";
const KEY_INFO = "user-access-token:v1";

export const NOTIFICATION_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Signing key derived from the internal token both services already share:
 * the internal token itself never signs anything.
 */
export function deriveNotificationTokenKey(internalToken: string): Uint8Array {
  if (!internalToken) {
    throw new Error("The notification internal token is not configured.");
  }
  return new Uint8Array(
    hkdfSync("sha256", internalToken, KEY_SALT, KEY_INFO, 32),
  );
}

export class NotificationAccessTokenIssuer
  implements INotificationAccessTokenIssuer
{
  private readonly key: Uint8Array;

  public constructor(
    internalToken: string,
    private readonly ttlSeconds: number = NOTIFICATION_TOKEN_TTL_SECONDS,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = deriveNotificationTokenKey(internalToken);
  }

  public async issue(userId: string): Promise<NotificationAccessToken> {
    if (!userId) {
      throw new Error("A user id is required to issue a notification token.");
    }
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const expiresAtSeconds = issuedAt + this.ttlSeconds;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(NOTIFICATION_TOKEN_ISSUER)
      .setAudience(NOTIFICATION_TOKEN_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }
}
