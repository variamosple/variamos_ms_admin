import { QueryTypes, type Transaction } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorName } from "#src/Domain/Core/Error/errorMessage.js";
import { accountRefusalOf } from "#src/Domain/User/Entity/AccountAccess.js";
import type { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type {
  IUserPasswordRepository,
  PasswordResetOutcome,
} from "#src/Domain/User/IUserPasswordRepository.js";
import type { IPasswordHasher } from "#src/Domain/User/Service/IPasswordHasher.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";

/** Passwords: changed by their owner, or reset with a single-use token. */
export class UserPasswordRepositoryImpl implements IUserPasswordRepository {
  public constructor(private readonly passwordHasher: IPasswordHasher) {}

  public async updateUserPassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const passwordUpdate = request.data;
      if (!passwordUpdate) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Password update data is required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: passwordUpdate.getId() },
      });

      if (!dbUser) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        );
      }

      const passwordMatch = await this.passwordHasher.verify(
        passwordUpdate.getCurrentPassword(),
        dbUser.password ?? null,
      );

      if (!passwordMatch) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Current password is incorrect.",
        );
      }

      const newHashedPassword = await this.passwordHasher.hash(
        passwordUpdate.getNewPassword(),
      );

      await VARIAMOS_ORM.transaction(async (transaction) => {
        await UserModel.update(
          { password: newHashedPassword },
          { where: { id: dbUser.id }, transaction },
        );
        await this.forgetTrustedDevices(String(dbUser.id), transaction);
      });
    } catch (error) {
      logger.err("Error in updateUserPassword:");
      logger.err(
        `Error trying to update user password with id: ${request.data ? request.data.getId() : ""}`,
      );
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  /** A new password asks the sign-in code again on every browser (lot 6). */
  private async forgetTrustedDevices(
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    await VARIAMOS_ORM.query(
      `DELETE FROM "${DB_SCHEMA}"."user_mfa_trusted_device" WHERE "user_id" = :userId`,
      { replacements: { userId }, transaction },
    );
  }

  public async savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await VARIAMOS_ORM.query(
        `
        INSERT INTO "${DB_SCHEMA}"."password_reset_tokens"
        ("user_id", "token_hash", "expires_at")
        VALUES
        (:userId, :tokenHash, :expiresAt)
        `,
        {
          replacements: {
            userId,
            tokenHash,
            expiresAt,
          },
        },
      );
    } catch (error) {
      logger.err(`Error in savePasswordResetToken: ${errorName(error)}`);
      throw error;
    }
  }

  public async getPasswordResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: Date;
    usedAt?: Date | null;
    isUserActive: boolean;
  } | null> {
    try {
      interface PasswordResetTokenRow {
        userId: string;
        expiresAt: Date;
        usedAt?: Date | null;
        // Null when the account no longer exists
        isEnabled: boolean | null;
        isDeleted: boolean | null;
      }

      const results = await VARIAMOS_ORM.query<PasswordResetTokenRow>(
        `
        SELECT t."user_id" AS "userId", t."expires_at" AS "expiresAt",
          t."used_at" AS "usedAt",
          u."is_enabled" AS "isEnabled", u."is_deleted" AS "isDeleted"
        FROM "${DB_SCHEMA}"."password_reset_tokens" t
        LEFT JOIN "${DB_SCHEMA}"."user" u ON u."id"::text = t."user_id"
        WHERE t."token_hash" = :tokenHash
        LIMIT 1
        `,
        {
          replacements: { tokenHash },
          type: QueryTypes.SELECT,
        },
      );
      const row = results[0];
      return row
        ? {
            userId: row.userId,
            expiresAt: row.expiresAt,
            usedAt: row.usedAt,
            isUserActive: accountRefusalOf(row) === null,
          }
        : null;
    } catch (error) {
      logger.err(`Error in getPasswordResetToken: ${errorName(error)}`);
      return null;
    }
  }

  public async resetPasswordWithToken(
    tokenHash: string,
    passwordPlain: string,
  ): Promise<PasswordResetOutcome> {
    const transaction = await VARIAMOS_ORM.transaction();
    try {
      // Check and consume in one statement: a concurrent request waits on the
      // row lock, then finds used_at set and updates nothing.
      const consumed = await VARIAMOS_ORM.query<{ userId: string }>(
        `
        UPDATE "${DB_SCHEMA}"."password_reset_tokens"
        SET "used_at" = NOW()
        WHERE "token_hash" = :tokenHash
          AND "used_at" IS NULL
          AND "expires_at" > :now
        RETURNING "user_id" AS "userId"
        `,
        {
          replacements: { tokenHash, now: new Date() },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const userId = consumed[0]?.userId;
      if (!userId) {
        await transaction.rollback();
        return "invalid_token";
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      // Decided here, inside the transaction that locks the account
      if (!dbUser || accountRefusalOf(dbUser) !== null) {
        await transaction.rollback();
        return "inactive_account";
      }

      if (
        await this.passwordHasher.verify(passwordPlain, dbUser.password || null)
      ) {
        // Rolled back: the link stays usable for another password
        await transaction.rollback();
        return "same_password";
      }

      const passwordHash = await this.passwordHasher.hash(passwordPlain);
      await UserModel.update(
        { password: passwordHash },
        { where: { id: userId }, transaction },
      );
      await this.forgetTrustedDevices(userId, transaction);

      await transaction.commit();
      return "reset";
    } catch (error) {
      await transaction.rollback();
      logger.err(`Error in resetPasswordWithToken: ${errorName(error)}`);
      throw error;
    }
  }
}
