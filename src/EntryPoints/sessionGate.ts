import type { SessionRegistry } from "#src/Domain/Session/UseCase/SessionRegistry.js";

/**
 * What the routes use from the session registry (EV-74 lot 2): open a
 * session, tell why one can no longer be used, end one.
 */
export type SessionGate = Pick<SessionRegistry, "open" | "check" | "revoke">;
