import { QueryTypes, type Sequelize } from "sequelize";
import logger from "#src/common/logger.js";
import type {
  AccessEntry,
  KnownAccount,
} from "#src/Domain/Activity/AccessEntry.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";

// Same value as the trigger of migration 0006
const RETENTION = "6 months";

/**
 * Table `admin_access_logs` (migration 0006), append-only. A failed write
 * is logged and never fails the request.
 */
export class AccessJournalRepositoryImpl
  implements IAccessJournal, IJournalPurge
{
  public readonly journal = "access";

  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  public async record(entry: AccessEntry): Promise<void> {
    try {
      await this.sequelize.query(
        `INSERT INTO "${this.schema}"."admin_access_logs"
           ("event", "outcome", "reason", "user_id", "ip", "method", "path",
            "status_code")
         VALUES (:event, :outcome, :reason, :userId, :ip, :method, :path,
            :statusCode)`,
        {
          replacements: {
            ...entry,
            ip: entry.ip?.slice(0, 64) ?? null,
            path: entry.path?.slice(0, 255) ?? null,
          },
        },
      );
    } catch (error) {
      // The name only: a driver message may quote the values
      logger.err(
        `[ACCESS] ${entry.event} not recorded: ${(error as Error).name}`,
      );
    }
  }

  public async accountByEmail(email: string): Promise<KnownAccount | null> {
    try {
      const [row] = await this.sequelize.query<{
        id: string;
        is_enabled: boolean;
        is_deleted: boolean;
      }>(
        `SELECT "id", "is_enabled", "is_deleted" FROM "${this.schema}"."user"
          WHERE lower("email") = lower(:email) LIMIT 1`,
        { replacements: { email }, type: QueryTypes.SELECT },
      );
      return row
        ? { id: row.id, active: row.is_enabled && !row.is_deleted }
        : null;
    } catch (error) {
      logger.err(`[ACCESS] account lookup failed: ${(error as Error).name}`);
      return null;
    }
  }

  public async purgeExpired(): Promise<number> {
    const [, result] = await this.sequelize.query(
      `DELETE FROM "${this.schema}"."admin_access_logs"
        WHERE "occurred_at" < now() - interval '${RETENTION}'`,
    );
    return (result as { rowCount?: number } | undefined)?.rowCount ?? 0;
  }
}
