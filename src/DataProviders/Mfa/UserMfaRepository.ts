import { QueryTypes, type Sequelize, type Transaction } from "sequelize";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";

interface UserMfaRow {
  user_id: string;
  secret_encrypted: string;
  enabled_at: Date | null;
  last_used_step: string | number | null;
}

/**
 * Tables `user_mfa` and `user_mfa_recovery_code` (migration 0003). Each
 * change is one conditional statement, so that two requests at the same
 * time cannot both use one code or one step.
 */
export class UserMfaRepositoryImpl implements IUserMfaRepository {
  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }

  private rows<T extends object>(
    sql: string,
    replacements: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<T[]> {
    return this.sequelize.query<T>(sql, {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    });
  }

  public async findByUser(userId: string): Promise<UserMfaRecord | null> {
    const [row] = await this.rows<UserMfaRow>(
      `SELECT "user_id", "secret_encrypted", "enabled_at", "last_used_step"
         FROM ${this.table("user_mfa")} WHERE "user_id" = :userId`,
      { userId },
    );
    if (!row) return null;
    return {
      userId: row.user_id,
      secretEncrypted: row.secret_encrypted,
      enabledAt: row.enabled_at,
      // bigint comes back as a string
      lastUsedStep:
        row.last_used_step === null ? null : Number(row.last_used_step),
    };
  }

  public async savePending(
    userId: string,
    secretEncrypted: string,
  ): Promise<boolean> {
    const saved = await this.rows(
      `INSERT INTO ${this.table("user_mfa")} ("user_id", "secret_encrypted")
       VALUES (:userId, :secretEncrypted)
       ON CONFLICT ("user_id") DO UPDATE
         SET "secret_encrypted" = EXCLUDED."secret_encrypted",
             "last_used_step" = NULL,
             "updated_at" = CURRENT_TIMESTAMP
         WHERE ${this.table("user_mfa")}."enabled_at" IS NULL
       RETURNING "user_id"`,
      { userId, secretEncrypted },
    );
    return saved.length > 0;
  }

  public async enable(
    userId: string,
    step: number,
    codeHashes: string[],
  ): Promise<boolean> {
    return this.sequelize.transaction(async (transaction) => {
      const enabled = await this.rows(
        `UPDATE ${this.table("user_mfa")}
            SET "enabled_at" = CURRENT_TIMESTAMP, "last_used_step" = :step,
                "updated_at" = CURRENT_TIMESTAMP
          WHERE "user_id" = :userId AND "enabled_at" IS NULL
          RETURNING "user_id"`,
        { userId, step },
        transaction,
      );
      if (enabled.length === 0) return false;
      await this.sequelize.query(
        `DELETE FROM ${this.table("user_mfa_recovery_code")} WHERE "user_id" = :userId`,
        { replacements: { userId }, transaction },
      );
      if (codeHashes.length > 0) {
        await this.sequelize.query(
          `INSERT INTO ${this.table("user_mfa_recovery_code")} ("user_id", "code_hash")
           SELECT :userId, hash FROM unnest(ARRAY[:codeHashes]::varchar[]) AS hash`,
          { replacements: { userId, codeHashes }, transaction },
        );
      }
      return true;
    });
  }

  public async recordStep(userId: string, step: number): Promise<boolean> {
    const recorded = await this.rows(
      `UPDATE ${this.table("user_mfa")}
          SET "last_used_step" = :step, "updated_at" = CURRENT_TIMESTAMP
        WHERE "user_id" = :userId AND "enabled_at" IS NOT NULL
          AND ("last_used_step" IS NULL OR "last_used_step" < :step)
        RETURNING "user_id"`,
      { userId, step },
    );
    return recorded.length > 0;
  }

  public async useRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<boolean> {
    const used = await this.rows(
      `UPDATE ${this.table("user_mfa_recovery_code")}
          SET "used_at" = CURRENT_TIMESTAMP
        WHERE "user_id" = :userId AND "code_hash" = :codeHash
          AND "used_at" IS NULL
        RETURNING "id"`,
      { userId, codeHash },
    );
    return used.length > 0;
  }

  public async countUnusedRecoveryCodes(userId: string): Promise<number> {
    const [row] = await this.rows<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM ${this.table("user_mfa_recovery_code")}
        WHERE "user_id" = :userId AND "used_at" IS NULL`,
      { userId },
    );
    return row?.count ?? 0;
  }

  public async remove(userId: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      for (const table of ["user_mfa_recovery_code", "user_mfa"]) {
        await this.sequelize.query(
          `DELETE FROM ${this.table(table)} WHERE "user_id" = :userId`,
          { replacements: { userId }, transaction },
        );
      }
    });
  }
}
