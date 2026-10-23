import logger from "jet-logger";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { IUserMfaRepository } from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";

export interface AccountMfaStatus {
  enabled: boolean;
}

export interface MfaResetResult {
  /** False when the owner could not be told by e-mail. */
  emailSent: boolean;
}

/**
 * An administrator turns off the second factor of an account that lost it,
 * phone and recovery codes included (SPC-2026-10-17-001, lot 4). The role
 * hierarchy is checked by the route; the owner is told by e-mail.
 */
export class MfaResetUseCase {
  public constructor(
    private readonly mfaRepository: Pick<
      IUserMfaRepository,
      "findByUser" | "remove"
    >,
    private readonly userRepository: Pick<IUserRepository, "queryById">,
    private readonly mailService: Pick<IMailService, "sendMfaResetMail">,
    private readonly journal: IActivityJournal,
  ) {}

  public async status(
    transactionId: string,
    userId: string,
  ): Promise<ResponseModel<AccountMfaStatus>> {
    const response = new ResponseModel<AccountMfaStatus>(transactionId);
    try {
      const record = await this.mfaRepository.findByUser(userId);
      return response.withResponse({ enabled: !!record?.enabledAt });
    } catch (error) {
      return this.systemError(response, "status", error);
    }
  }

  public async reset(
    transactionId: string,
    userId: string,
    adminId: string,
  ): Promise<ResponseModel<MfaResetResult>> {
    return withJournal(
      this.journal,
      {
        actorId: adminId,
        action: "user.mfa.reset",
        entityType: "user",
        entityId: userId,
        after: { mfaEnabled: false },
        transactionId,
      },
      () => this.turnOff(transactionId, userId, adminId),
    );
  }

  private async turnOff(
    transactionId: string,
    userId: string,
    adminId: string,
  ): Promise<ResponseModel<MfaResetResult>> {
    const response = new ResponseModel<MfaResetResult>(transactionId);
    try {
      const record = await this.mfaRepository.findByUser(userId);
      if (!record?.enabledAt) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "Two-factor authentication is not on for this account.",
        );
      }
      const user = await this.userRepository.queryById(
        new RequestModel(transactionId, userId),
      );
      if (user.errorCode || !user.data) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        );
      }

      await this.mfaRepository.remove(userId);
      logger.info(
        `[MFA] Two-factor authentication of user ${userId} turned off by administrator ${adminId}`,
      );

      const emailSent = await this.mailService
        .sendMfaResetMail(user.data.email)
        .catch(() => false);
      if (!emailSent) {
        logger.warn(`[MFA] User ${userId} could not be told of the reset`);
      }
      return response.withResponse({ emailSent });
    } catch (error) {
      return this.systemError(response, "reset", error);
    }
  }

  private systemError<T>(
    response: ResponseModel<T>,
    operation: string,
    error: unknown,
  ): ResponseModel<T> {
    logger.err(`[MFA] ${operation} failed: ${(error as Error).message}`);
    return response.withError(
      DomainErrorCodes.SYSTEM_ERROR,
      "Internal server error",
    );
  }
}
