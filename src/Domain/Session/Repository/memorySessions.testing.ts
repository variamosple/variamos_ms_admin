import type { SessionRecord } from "#src/Domain/Session/Entity/SessionPolicy.js";
import type { ISessionRepository } from "#src/Domain/Session/Repository/ISessionRepository.js";

/**
 * The registry table, kept in memory with the clock of the test (EV-74
 * lot 2). Each change happens at once; the promises only follow the port.
 */
export function memorySessions(clock: { now: number }) {
  const rows = new Map<string, SessionRecord>();
  const openRow = (idHash: string) => {
    const row = rows.get(idHash);
    return row && !row.revokedAt ? row : undefined;
  };
  const repository: ISessionRepository = {
    open: (idHash, userId) => {
      const at = new Date(clock.now);
      rows.set(idHash, {
        userId,
        startedAt: at,
        lastSeenAt: at,
        revokedAt: null,
      });
      return Promise.resolve();
    },
    find: (idHash) => {
      const row = rows.get(idHash);
      return Promise.resolve(row ? { ...row } : null);
    },
    touch: (idHash) => {
      const row = openRow(idHash);
      if (row) row.lastSeenAt = new Date(clock.now);
      return Promise.resolve();
    },
    revoke: (idHash) => {
      const row = openRow(idHash);
      if (row) row.revokedAt = new Date(clock.now);
      return Promise.resolve();
    },
    revokeAllOf: (userId) => {
      let revoked = 0;
      for (const row of rows.values()) {
        if (row.userId === userId && !row.revokedAt) {
          row.revokedAt = new Date(clock.now);
          revoked += 1;
        }
      }
      return Promise.resolve(revoked);
    },
  };
  return { rows, repository };
}
