import { QueryTypes, type Sequelize } from "sequelize";
import type {
  AccessFilter,
  AccessRecord,
  ActivityFilter,
  ActivityRecord,
  IJournalReader,
  JournalAccount,
  JournalPage,
} from "#src/Domain/Activity/JournalQuery.js";

type Replacements = Record<string, unknown>;

// A typed text is matched literally, never as a LIKE pattern
const likeOf = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

interface AccountColumns {
  account_name: string | null;
  account_email: string | null;
  account_found: boolean;
}

const accountOf = (
  id: string | null,
  row: AccountColumns,
): JournalAccount | null =>
  id && row.account_found
    ? { id, name: row.account_name, email: row.account_email }
    : null;

/**
 * Reads `admin_activity_logs` and `admin_access_logs` (T-24 lot 3), with the
 * name and e-mail of the account when it still exists. Parameters only.
 */
export class JournalReaderRepositoryImpl implements IJournalReader {
  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  public async queryActivity(
    filter: ActivityFilter,
  ): Promise<JournalPage<ActivityRecord>> {
    const where: string[] = [];
    const replacements: Replacements = {};
    this.common(filter, 'l."actor_id"', where, replacements);
    if (filter.action) {
      where.push(`l."action" = :action`);
      replacements.action = filter.action;
    }
    if (filter.entityType) {
      where.push(`l."entity_type" = :entityType`);
      replacements.entityType = filter.entityType;
    }
    if (filter.entityId) {
      where.push(`l."entity_id" = :entityId`);
      replacements.entityId = filter.entityId;
    }

    const page = await this.page<
      AccountColumns & {
        id: string;
        occurred_at: Date;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        outcome: string;
        error_code: string | null;
        before: unknown;
        after: unknown;
        transaction_id: string | null;
      }
    >(
      "admin_activity_logs",
      "actor_id",
      `l."id", l."occurred_at", l."actor_id", l."action", l."entity_type",
       l."entity_id", l."outcome", l."error_code", l."before", l."after",
       l."transaction_id"`,
      where,
      replacements,
      filter,
    );
    return {
      total: page.total,
      rows: page.rows.map((row) => ({
        id: String(row.id),
        occurredAt: row.occurred_at,
        actorId: row.actor_id,
        actor: accountOf(row.actor_id, row),
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        outcome: row.outcome,
        errorCode: row.error_code,
        before: row.before,
        after: row.after,
        transactionId: row.transaction_id,
      })),
    };
  }

  public async queryAccess(
    filter: AccessFilter,
  ): Promise<JournalPage<AccessRecord>> {
    const where: string[] = [];
    const replacements: Replacements = {};
    this.common(filter, 'l."user_id"', where, replacements);
    if (filter.event) {
      where.push(`l."event" = :event`);
      replacements.event = filter.event;
    }
    if (filter.reason) {
      where.push(`l."reason" = :reason`);
      replacements.reason = filter.reason;
    }
    if (filter.ip) {
      where.push(`l."ip" = :ip`);
      replacements.ip = filter.ip;
    }

    const page = await this.page<
      AccountColumns & {
        id: string;
        occurred_at: Date;
        user_id: string | null;
        event: string;
        outcome: string;
        reason: string | null;
        ip: string | null;
        method: string | null;
        path: string | null;
        status_code: number | null;
      }
    >(
      "admin_access_logs",
      "user_id",
      `l."id", l."occurred_at", l."user_id", l."event", l."outcome",
       l."reason", l."ip", l."method", l."path", l."status_code"`,
      where,
      replacements,
      filter,
    );
    return {
      total: page.total,
      rows: page.rows.map((row) => ({
        id: String(row.id),
        occurredAt: row.occurred_at,
        userId: row.user_id,
        user: accountOf(row.user_id, row),
        event: row.event,
        outcome: row.outcome,
        reason: row.reason,
        ip: row.ip,
        method: row.method,
        path: row.path,
        statusCode: row.status_code,
      })),
    };
  }

  /** Period, account (id, or part of a name or e-mail) and outcome. */
  private common(
    filter: ActivityFilter | AccessFilter,
    accountColumn: string,
    where: string[],
    replacements: Replacements,
  ): void {
    where.push(`l."occurred_at" >= :from`, `l."occurred_at" <= :to`);
    replacements.from = filter.from;
    replacements.to = filter.to;
    if (filter.outcome) {
      where.push(`l."outcome" = :outcome`);
      replacements.outcome = filter.outcome;
    }
    if (filter.user) {
      where.push(
        `(${accountColumn} = :user OR u."email" ILIKE :userLike OR u."name" ILIKE :userLike)`,
      );
      replacements.user = filter.user;
      replacements.userLike = likeOf(filter.user);
    }
  }

  private async page<Row extends object>(
    table: string,
    accountColumn: string,
    columns: string,
    where: string[],
    replacements: Replacements,
    filter: { pageNumber: number; pageSize: number },
  ): Promise<{ rows: Row[]; total: number }> {
    const from = `FROM "${this.schema}"."${table}" l
      LEFT JOIN "${this.schema}"."user" u ON u."id"::text = l."${accountColumn}"
      WHERE ${where.join(" AND ")}`;
    const [count] = await this.sequelize.query<{ total: string }>(
      `SELECT count(*) AS "total" ${from}`,
      { replacements, type: QueryTypes.SELECT },
    );
    const rows = await this.sequelize.query<Row>(
      `SELECT ${columns}, u."name" AS "account_name",
              u."email" AS "account_email", u."id" IS NOT NULL AS "account_found"
         ${from}
        ORDER BY l."occurred_at" DESC, l."id" DESC
        LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          ...replacements,
          limit: filter.pageSize,
          offset: (filter.pageNumber - 1) * filter.pageSize,
        },
        type: QueryTypes.SELECT,
      },
    );
    return { rows, total: Number(count?.total ?? 0) };
  }
}
