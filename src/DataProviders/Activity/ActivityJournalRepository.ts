import type { Sequelize } from "sequelize";
import logger from "#src/common/logger.js";
import type { ActivityEntry } from "#src/Domain/Activity/ActivityEntry.js";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";

// Same value as the trigger of migration 0005
const RETENTION = "1 year";

/**
 * Table `admin_activity_logs` (migration 0005), append-only. A failed write
 * is logged and never fails the operation it records.
 */
export class ActivityJournalRepositoryImpl
  implements IActivityJournal, IJournalPurge
{
  public readonly journal = "activity";

  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  public async record(entry: ActivityEntry): Promise<void> {
    try {
      await this.sequelize.query(
        `INSERT INTO "${this.schema}"."admin_activity_logs"
           ("actor_id", "action", "entity_type", "entity_id", "outcome",
            "error_code", "before", "after", "transaction_id")
         VALUES (:actorId, :action, :entityType, :entityId, :outcome,
            :errorCode, CAST(:before AS jsonb), CAST(:after AS jsonb),
            :transactionId)`,
        {
          replacements: {
            ...entry,
            before: entry.before ? JSON.stringify(entry.before) : null,
            after: entry.after ? JSON.stringify(entry.after) : null,
          },
        },
      );
    } catch (error) {
      // The name only: a driver message may quote the values
      logger.err(
        `[ACTIVITY] ${entry.action} on ${entry.entityType} not recorded: ${(error as Error).name}`,
      );
    }
  }

  public async purgeExpired(): Promise<number> {
    const [, result] = await this.sequelize.query(
      `DELETE FROM "${this.schema}"."admin_activity_logs"
        WHERE "occurred_at" < now() - interval '${RETENTION}'`,
    );
    return (result as { rowCount?: number } | undefined)?.rowCount ?? 0;
  }
}
