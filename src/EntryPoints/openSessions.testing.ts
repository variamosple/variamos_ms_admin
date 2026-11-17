import type { SessionGate } from "./sessionGate.js";

/**
 * A session registry for the route tests that are not about sessions: every
 * session it opens stays open (EV-74 lot 2).
 */
export const openSessions = (): SessionGate => ({
  open: async () => "test-session",
  check: async () => null,
  revoke: async () => undefined,
});
