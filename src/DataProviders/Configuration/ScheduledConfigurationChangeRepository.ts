import { QueryTypes, type Sequelize, type Transaction } from "sequelize";
import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import type {
  ScheduledChangeOutcome,
  ScheduledChangeStatus,
  ScheduledConfigurationChange,
} from "#src/Domain/Configuration/Entity/ScheduledConfigurationChange.js";
import type {
  IScheduledConfigurationChangeRepository,
  PlannedChange,
} from "#src/Domain/Configuration/Repository/IScheduledConfigurationChangeRepository.js";

/** Due changes resolved in one pass at most; the rest wait a minute. */
export const MAX_CHANGES_PER_PASS = 50;

interface ChangeRow {
  // A bigint column: the driver gives it as a string
  id: number | string;
  key: string;
  previousValue: ConfigurationValue;
  newValue: ConfigurationValue;
  baseUpdatedAt: Date | null;
  dueAt: Date;
  status: ScheduledChangeStatus;
  reason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

const COLUMNS = `"id", "config_key" AS "key", "previous_value" AS "previousValue",
  "new_value" AS "newValue", "base_updated_at" AS "baseUpdatedAt",
  "due_at" AS "dueAt", "status", "reason", "created_by" AS "createdBy",
  "updated_by" AS "updatedBy", "created_at" AS "createdAt",
  "updated_at" AS "updatedAt", "resolved_at" AS "resolvedAt"`;

// The driver gives timestamptz columns as Date objects
const toChange = (row: ChangeRow): ScheduledConfigurationChange => ({
  ...row,
  id: Number(row.id),
});

const planned = (change: PlannedChange) => ({
  previousValue: JSON.stringify(change.previousValue),
  newValue: JSON.stringify(change.newValue),
  baseUpdatedAt: change.baseUpdatedAt,
  dueAt: change.dueAt,
});

/** Table `scheduled_configuration_changes` (migration 0019, EV-115 lot B). */
export class ScheduledConfigurationChangeRepositoryImpl
  implements IScheduledConfigurationChangeRepository
{
  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private get table(): string {
    return `"${this.schema}"."scheduled_configuration_changes"`;
  }

  private async select(
    where: string,
    replacements: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<ScheduledConfigurationChange[]> {
    const rows = await this.sequelize.query<ChangeRow>(
      `SELECT ${COLUMNS} FROM ${this.table} ${where}`,
      { replacements, type: QueryTypes.SELECT, transaction },
    );
    return rows.map(toChange);
  }

  private async returning(
    sql: string,
    replacements: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<ScheduledConfigurationChange | null> {
    // As a SELECT: the rows that RETURNING gives back
    const rows = await this.sequelize.query<ChangeRow>(
      `${sql} RETURNING ${COLUMNS}`,
      { replacements, type: QueryTypes.SELECT, transaction },
    );
    return rows[0] ? toChange(rows[0]) : null;
  }

  public list(resolvedSince: Date): Promise<ScheduledConfigurationChange[]> {
    return this.select(
      `WHERE "status" = 'scheduled' OR "resolved_at" >= :resolvedSince
       ORDER BY ("status" = 'scheduled') DESC, "due_at", "resolved_at" DESC, "id"
       LIMIT 200`,
      { resolvedSince },
    );
  }

  public async findById(
    id: number,
  ): Promise<ScheduledConfigurationChange | null> {
    const [change] = await this.select(`WHERE "id" = :id`, { id });
    return change ?? null;
  }

  public create(
    change: PlannedChange & { key: string; createdBy: string },
  ): Promise<ScheduledConfigurationChange | null> {
    // A change of the key already planned: the unique index keeps it alone
    return this.returning(
      `INSERT INTO ${this.table}
         ("config_key", "previous_value", "new_value", "base_updated_at", "due_at", "created_by")
       VALUES (:key, CAST(:previousValue AS jsonb), CAST(:newValue AS jsonb),
               :baseUpdatedAt, :dueAt, :createdBy)
       ON CONFLICT DO NOTHING`,
      { ...planned(change), key: change.key, createdBy: change.createdBy },
    );
  }

  public reschedule(
    id: number,
    change: PlannedChange & { updatedBy: string },
  ): Promise<ScheduledConfigurationChange | null> {
    return this.returning(
      `UPDATE ${this.table}
          SET "previous_value" = CAST(:previousValue AS jsonb),
              "new_value" = CAST(:newValue AS jsonb),
              "base_updated_at" = :baseUpdatedAt, "due_at" = :dueAt,
              "updated_by" = :updatedBy, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = :id AND "status" = 'scheduled'`,
      { ...planned(change), id, updatedBy: change.updatedBy },
    );
  }

  public cancel(
    id: number,
    cancelledBy: string,
  ): Promise<ScheduledConfigurationChange | null> {
    return this.returning(
      `UPDATE ${this.table}
          SET "status" = 'cancelled', "updated_by" = :cancelledBy,
              "updated_at" = CURRENT_TIMESTAMP, "resolved_at" = CURRENT_TIMESTAMP
        WHERE "id" = :id AND "status" = 'scheduled'`,
      { id, cancelledBy },
    );
  }

  public async resolveDue(
    now: Date,
    resolve: (
      change: ScheduledConfigurationChange,
    ) => Promise<ScheduledChangeOutcome>,
  ): Promise<number> {
    let resolved = 0;
    while (resolved < MAX_CHANGES_PER_PASS) {
      // One transaction per change: the row stays locked while it is
      // applied, so that another instance skips it and an edit waits
      const done = await this.sequelize.transaction(async (transaction) => {
        const [change] = await this.select(
          `WHERE "status" = 'scheduled' AND "due_at" <= :now
           ORDER BY "due_at", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`,
          { now },
          transaction,
        );
        if (!change) return false;
        const outcome = await resolve(change);
        await this.sequelize.query(
          `UPDATE ${this.table}
              SET "status" = :status, "reason" = :reason,
                  "updated_at" = CURRENT_TIMESTAMP, "resolved_at" = CURRENT_TIMESTAMP
            WHERE "id" = :id`,
          {
            replacements: { id: change.id, ...outcome },
            transaction,
          },
        );
        return true;
      });
      if (!done) break;
      resolved += 1;
    }
    return resolved;
  }
}
