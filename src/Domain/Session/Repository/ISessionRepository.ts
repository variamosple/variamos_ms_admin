import type { SessionRecord } from "#src/Domain/Session/Entity/SessionPolicy.js";

/**
 * The sessions opened at sign-in. A session is known by the hash of its
 * identifier only: the identifier itself stays in the browser's cookie.
 */
export interface ISessionRepository {
  open(idHash: string, userId: string): Promise<void>;
  find(idHash: string): Promise<SessionRecord | null>;
  /** Records a request of the session, at the database's time. */
  touch(idHash: string): Promise<void>;
  revoke(idHash: string): Promise<void>;
  /** Ends every open session of the account; gives how many were open. */
  revokeAllOf(userId: string): Promise<number>;
}

/** What the account and password flows need: ending the sessions of an account. */
export interface ISessionRevoker {
  revokeAllOf(userId: string): Promise<number>;
}

/** For callers and tests without a registry: nothing to end. */
export const NO_SESSION_REVOKER: ISessionRevoker = {
  revokeAllOf: async () => 0,
};
