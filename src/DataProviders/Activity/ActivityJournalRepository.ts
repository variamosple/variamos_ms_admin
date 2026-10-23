import logger from "jet-logger";
import type { Sequelize } from "sequelize";
import type { ActivityEntry } from "#src/Domain/Activity/ActivityEntry.js";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";

/**
 * Table `admin_activity_logs` (migration 0005), append-only. A failed write
 * is logged and never fails the operation it records.
 */
export class ActivityJournalRepositoryImpl implements IActivityJournal {
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
}
