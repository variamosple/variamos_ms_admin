import crypto from "node:crypto";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { PasswordPolicy } from "#src/Domain/User/Entity/PasswordPolicy.js";
import type {
  IUserRepository,
  PasswordResetOutcome,
} from "#src/Domain/User/IUserRepository.js";
import {
  checkNewPassword,
  DEFAULT_PASSWORD_POLICY_PROVIDER,
  type IPasswordPolicyProvider,
} from "#src/Domain/User/Service/PasswordPolicyService.js";
import { PasswordResetTokenService } from "#src/Domain/User/Service/PasswordResetTokenService.js";

export interface UserPasswordUseCaseConfig {
  passwordResetExpiryInMs: number;
  adminHomeUri: string;
}

/** A reset link is valid for one hour at most, whatever the configuration. */
export const MAX_PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

const RESET_REFUSALS: Record<Exclude<PasswordResetOutcome, "reset">, string> = {
  invalid_token: "Invalid token.",
  inactive_account: "Invalid token.",
  same_password: "New password cannot be the same as the old password.",
};

export class UserPasswordUseCase {
  private readonly tokenService: PasswordResetTokenService;

  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly mailService: IMailService,
    private readonly config: UserPasswordUseCaseConfig,
    private readonly journal: IActivityJournal,
    private readonly logger: ILogger,
    private readonly passwordPolicy: IPasswordPolicyProvider = DEFAULT_PASSWORD_POLICY_PROVIDER,
  ) {
    this.tokenService = new PasswordResetTokenService(userRepository, logger);
  }

  /**
   * security.password.reset_expiry when set, else the environment value;
   * one hour at most either way.
   */
  private async resetExpiryMs(): Promise<number> {
    const configured =
      (await this.passwordPolicy.getResetExpiryMs()) ??
      this.config.passwordResetExpiryInMs;
    return Number.isFinite(configured) && configured > 0
      ? Math.min(configured, MAX_PASSWORD_RESET_EXPIRY_MS)
      : MAX_PASSWORD_RESET_EXPIRY_MS;
  }

  /** The policy for new passwords, read by the UI forms. */
  public async getPasswordPolicy(): Promise<
    ResponseModel<ReturnType<PasswordPolicy["toJSON"]>>
  > {
    const response = new ResponseModel<ReturnType<PasswordPolicy["toJSON"]>>(
      "getPasswordPolicy",
    );
    response.data = (await this.passwordPolicy.getPolicy()).toJSON();
    return response;
  }

  public async requestReset(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    const email = request.data || "";
    if (!email) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Email is required.",
      );
    }

    // The answer is the same whether the address is known or not, and it
    // does not wait for the lookup or the e-mail: an SMTP failure is logged,
    // not returned (no account enumeration by content or response time).
    void this.sendResetLink(email);
    return response;
  }

  private async sendResetLink(email: string): Promise<void> {
    try {
      const user = await this.userRepository.getUserByEmail(email);
      if (!user) {
        this.logger.warn("[PASSWORD RESET ATTEMPT] Failed: Email not found.");
        return;
      }

      const expiryMs = await this.resetExpiryMs();
      let token: string;
      try {
        token = await this.tokenService.createResetToken(
          user,
          expiryMs,
          "PASSWORD RESET ATTEMPT",
        );
      } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes("disabled") || msg.includes("deleted")) {
          return;
        }
        throw error;
      }

      const recoveryLink = `${this.config.adminHomeUri}/#/reset-password?token=${token}`;
      const emailSent = await this.mailService.sendPasswordResetMail(
        email,
        recoveryLink,
        expiryMs,
      );
      if (!emailSent) {
        this.logger.err(
          "[PASSWORD RESET ATTEMPT] Failed: recovery e-mail not sent.",
        );
      }
    } catch (error) {
      this.logger.err("Error sending the password reset link:");
      this.logger.err(error as Error);
    }
  }

  public async verifyToken(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const token = request.data || "";
      if (!token) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Token is required.",
        );
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const dbToken =
        await this.userRepository.getPasswordResetToken(tokenHash);

      if (!dbToken) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Invalid token.",
        );
      }

      if (dbToken.usedAt) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Token already used.",
        );
      }

      if (new Date() > new Date(dbToken.expiresAt)) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Token expired.",
        );
      }

      // A link sent before the account was disabled or deleted is refused
      if (!dbToken.isUserActive) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Invalid token.",
        );
      }

      return response;
    } catch (error) {
      this.logger.err("Error verifying reset token:");
      this.logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error verifying reset token",
      );
    }
  }

  public async resetPassword(
    request: RequestModel<{ token: string; password: string }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const { token, password } = (request.data || {}) as Partial<{
        token: string;
        password: string;
      }>;
      if (!token || !password) {
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          "Token and password are required.",
        );
      }

      const refusal = await checkNewPassword(
        this.passwordPolicy,
        this.logger,
        password,
        "Password reset",
      );
      if (refusal) {
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          refusal,
        );
      }

      // Precise message for an unknown, used or expired token; the
      // repository checks again atomically when it consumes the token.
      const verifyRes = await this.verifyToken(
        new RequestModel<string>(request.transactionId, token),
      );
      if (verifyRes.errorCode) {
        return response.withError(
          verifyRes.errorCode,
          verifyRes.message || "Invalid token.",
        );
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const outcome = await this.userRepository.resetPasswordWithToken(
        tokenHash,
        password,
      );
      if (outcome !== "reset") {
        return response.withErrorPromise(
          outcome === "same_password"
            ? DomainErrorCodes.PASSWORD_REUSED
            : DomainErrorCodes.INVALID_INPUT,
          RESET_REFUSALS[outcome],
        );
      }

      return response;
    } catch (error) {
      this.logger.err("Error resetting password:");
      this.logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error resetting password",
      );
    }
  }

  public async generateLink(
    request: RequestModel<{ userId: string; adminId: string }>,
  ): Promise<ResponseModel<{ recoveryUrl: string }>> {
    // The link itself is a secret: only the fact that one was made is kept
    return withJournal(
      this.journal,
      {
        actorId: request.data?.adminId,
        action: "user.recovery-link",
        entityType: "user",
        entityId: request.data?.userId,
        transactionId: request.transactionId,
      },
      () => this.createLink(request),
      (response) => ({ after: { linkCreated: Boolean(response.data) } }),
    );
  }

  private async createLink(
    request: RequestModel<{ userId: string; adminId: string }>,
  ): Promise<ResponseModel<{ recoveryUrl: string }>> {
    const response = new ResponseModel<{ recoveryUrl: string }>(
      request.transactionId,
    );
    const { userId, adminId } = (request.data || {}) as Partial<{
      userId: string;
      adminId: string;
    }>;

    if (!userId || !adminId) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "User ID and Admin ID are required.",
      );
    }

    try {
      const targetUserResponse = await this.userRepository.queryById(
        new RequestModel<string>(request.transactionId, userId),
      );

      if (targetUserResponse.errorCode) {
        return response.copyErrorWithPromise(targetUserResponse);
      }

      const targetUser = targetUserResponse.data;
      if (!targetUser) {
        this.logger.warn(
          `[ADMIN PASSWORD RESET ATTEMPT] Failed: Admin (ID: ${adminId}) tried to generate a recovery link for a User (ID: ${userId}) but user was not found.`,
        );
        return response;
      }

      let token: string;
      try {
        token = await this.tokenService.createResetToken(
          targetUser,
          await this.resetExpiryMs(),
          "ADMIN PASSWORD RESET ATTEMPT",
        );
      } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes("disabled") || msg.includes("deleted")) {
          return response;
        }
        throw error;
      }

      this.logger.info(
        `[AUDIT] Admin (ID: ${adminId}) generated a password reset link for User (ID: ${userId})`,
      );

      response.data = {
        recoveryUrl: `${this.config.adminHomeUri}/#/reset-password?token=${token}`,
      };
      return response;
    } catch (error) {
      this.logger.err("Error generating recovery link:");
      this.logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error generating recovery link",
      );
    }
  }
}
