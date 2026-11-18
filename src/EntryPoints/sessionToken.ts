import { createJwt, type SessionUser } from "@variamosple/variamos-security";
import logger from "#src/common/logger.js";

// Browsers drop a cookie larger than 4096 bytes, name and attributes
// included: the sign-in answers 200 and the account stays signed out. The
// warning leaves room for the cookie name and attributes (EV-129).
export const SESSION_TOKEN_WARNING_BYTES = 3800;

/** Signs the session token, and warns when it nears the cookie limit. */
export async function createSessionJwt(
  sessionUser: SessionUser,
  audience?: string,
): Promise<string> {
  const token = await createJwt(sessionUser, audience);
  if (token.length > SESSION_TOKEN_WARNING_BYTES) {
    logger.warn(
      `[SESSION] token of ${token.length} bytes for account ${sessionUser.id} ` +
        `(${sessionUser.permissions?.length ?? 0} permissions, ` +
        `${sessionUser.roles?.length ?? 0} roles): browsers drop cookies over 4096 bytes`,
    );
  }
  return token;
}
