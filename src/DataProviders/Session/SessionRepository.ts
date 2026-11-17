import { QueryTypes, type Sequelize } from "sequelize";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import type { SessionRecord } from "#src/Domain/Session/Entity/SessionPolicy.js";
import type { ISessionRepository } from "#src/Domain/Session/Repository/ISessionRepository.js";
import { rowCountOf } from "../queryResults.js";

// Longer than any session may last (720 hours at most): a row past it only
// tells that an account signed in, which the access journal already keeps
const RETENTION = "31 days";

interface SessionRow {
  user_id: string;
  started_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
}

/** The registry of the sessions (migration 0033), in admin_sessions. */
export class SessionRepositoryImpl
  implements ISessionRepository, IJournalPurge
{
  public readonly journal = "session";

  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private get table(): string {
    return `"${this.schema}"."admin_sessions"`;
  }

  public async open(idHash: string, userId: string): Promise<void> {
    await this.sequelize.query(
      `INSERT INTO ${this.table} ("id_hash", "user_id") VALUES (:idHash, :userId)`,
      { replacements: { idHash, userId } },
    );
  }

  public async find(idHash: string): Promise<SessionRecord | null> {
    const [row] = await this.sequelize.query<SessionRow>(
      `SELECT "user_id", "started_at", "last_seen_at", "revoked_at"
         FROM ${this.table} WHERE "id_hash" = :idHash`,
      { replacements: { idHash }, type: QueryTypes.SELECT },
    );
    if (!row) return null;
    return {
      userId: row.user_id,
      startedAt: new Date(row.started_at),
      lastSeenAt: new Date(row.last_seen_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
  }

  public async touch(idHash: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE ${this.table} SET "last_seen_at" = now()
        WHERE "id_hash" = :idHash AND "revoked_at" IS NULL`,
      { replacements: { idHash } },
    );
  }

  public async revoke(idHash: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE ${this.table} SET "revoked_at" = now()
        WHERE "id_hash" = :idHash AND "revoked_at" IS NULL`,
      { replacements: { idHash } },
    );
  }

  public async revokeAllOf(userId: string): Promise<number> {
    const [, result] = await this.sequelize.query(
      `UPDATE ${this.table} SET "revoked_at" = now()
        WHERE "user_id" = :userId AND "revoked_at" IS NULL`,
      { replacements: { userId } },
    );
    return rowCountOf(result);
  }

  public async purgeExpired(): Promise<number> {
    const [, result] = await this.sequelize.query(
      `DELETE FROM ${this.table}
        WHERE "started_at" < now() - interval '${RETENTION}'`,
    );
    return rowCountOf(result);
  }
}
