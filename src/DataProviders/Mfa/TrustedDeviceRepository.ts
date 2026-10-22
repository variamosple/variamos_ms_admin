import { QueryTypes, type Sequelize } from "sequelize";
import type { ITrustedDeviceRepository } from "#src/Domain/Mfa/Repository/ITrustedDeviceRepository.js";

/** Browsers kept per user; trusting one more forgets the oldest. */
export const MAX_TRUSTED_DEVICES_PER_USER = 10;

/** Table `user_mfa_trusted_device` (migration 0004). */
export class TrustedDeviceRepositoryImpl implements ITrustedDeviceRepository {
  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }

  public async add(
    userId: string,
    tokenHash: string,
    days: number,
  ): Promise<void> {
    const devices = this.table("user_mfa_trusted_device");
    await this.sequelize.transaction(async (transaction) => {
      await this.sequelize.query(
        `INSERT INTO ${devices} ("user_id", "token_hash", "expires_at")
         VALUES (:userId, :tokenHash,
                 CURRENT_TIMESTAMP + make_interval(days => :days))`,
        { replacements: { userId, tokenHash, days }, transaction },
      );
      await this.sequelize.query(
        `DELETE FROM ${devices}
          WHERE "user_id" = :userId
            AND ("expires_at" <= CURRENT_TIMESTAMP
                 OR "id" NOT IN (SELECT "id" FROM ${devices}
                                  WHERE "user_id" = :userId
                                  ORDER BY "created_at" DESC, "id"
                                  LIMIT :max))`,
        {
          replacements: { userId, max: MAX_TRUSTED_DEVICES_PER_USER },
          transaction,
        },
      );
    });
  }

  public async use(
    userId: string,
    tokenHash: string,
    days: number,
  ): Promise<boolean> {
    const devices = this.table("user_mfa_trusted_device");
    const used = await this.sequelize.query(
      `UPDATE ${devices} AS d SET "last_used_at" = CURRENT_TIMESTAMP
        WHERE d."user_id" = :userId AND d."token_hash" = :tokenHash
          AND d."expires_at" > CURRENT_TIMESTAMP
          AND d."created_at" > CURRENT_TIMESTAMP - make_interval(days => :days)
          AND EXISTS (SELECT 1 FROM ${this.table("user_mfa")} AS m
                       WHERE m."user_id" = d."user_id"
                         AND m."enabled_at" IS NOT NULL
                         AND m."enabled_at" <= d."created_at")
        RETURNING d."id"`,
      {
        replacements: { userId, tokenHash, days },
        type: QueryTypes.SELECT,
      },
    );
    return used.length > 0;
  }

  public async removeAll(userId: string): Promise<number> {
    const removed = await this.sequelize.query(
      `DELETE FROM ${this.table("user_mfa_trusted_device")}
        WHERE "user_id" = :userId RETURNING "id"`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return removed.length;
  }
}
