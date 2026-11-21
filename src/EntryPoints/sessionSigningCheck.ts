import { createJwt, validateToken } from "@variamosple/variamos-security";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";

export type SessionSigningResult = { ok: true } | { ok: false; reason: string };

/** Signs a session token and checks it, as a sign in and a request would. */
export type SessionSigningCheck = () => Promise<SessionSigningResult>;

// Never sent anywhere: the token only proves that the keys work
const PROBE_ACCOUNT = {
  id: "session-signing-check",
  name: "",
  user: "",
  email: "",
  roles: [],
  permissions: [],
};

/** The two functions of variamos-security that open and read a session. */
export interface SessionTokens {
  sign: (account: typeof PROBE_ACCOUNT) => Promise<string>;
  verify: (
    token: string,
  ) => Promise<{ errorCode?: number; data?: { sub?: string } | null }>;
}

/**
 * Whether this service can still open sessions. The key store of
 * variamos-security only logs a missing, unreadable or malformed key, so the
 * service would start and answer UP while no one can sign in (ADM-N01).
 * Signing a token and verifying it, with the public functions of the
 * library, holds whatever the version of the library.
 */
export const createSessionSigningCheck =
  (tokens: SessionTokens): SessionSigningCheck =>
  async () => {
    let token: string;
    try {
      token = await tokens.sign(PROBE_ACCOUNT);
    } catch (e) {
      return {
        ok: false,
        reason: `a session token cannot be signed (${errorMessage(e)})`,
      };
    }

    const verified = await tokens.verify(token);
    if (verified.errorCode || verified.data?.sub !== PROBE_ACCOUNT.id) {
      return {
        ok: false,
        reason:
          "a session token it signed fails its own verification: the public key does not match the private key",
      };
    }
    return { ok: true };
  };

export const checkSessionSigning = createSessionSigningCheck({
  sign: (account) => createJwt(account),
  verify: validateToken,
});
