import crypto from "node:crypto";
import logger from "jet-logger";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import { Password } from "#src/Domain/User/Entity/Password.js";
import type {
  IUserRepository,
  PasswordResetOutcome,
} from "#src/Domain/User/IUserRepository.js";
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
  ) {
    this.tokenService = new PasswordResetTokenService(userRepository);
  }

  private get resetExpiryMs(): number {
    const configured = this.config.passwordResetExpiryInMs;
    return Number.isFinite(configured) && configured > 0
      ? Math.min(configured, MAX_PASSWORD_RESET_EXPIRY_MS)
      : MAX_PASSWORD_RESET_EXPIRY_MS;
  }

  public async requestReset(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const email = request.data || "";
      if (!email) {
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          "Email is required.",
        );
      }

      const user = await this.userRepository.getUserByEmail(email);

      if (!user) {
        logger.warn("[PASSWORD RESET ATTEMPT] Failed: Email not found.");
        return response;
      }

      let token: string;
      try {
        token = await this.tokenService.createResetToken(
          user,
          this.resetExpiryMs,
          "PASSWORD RESET ATTEMPT",
        );
      } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes("disabled") || msg.includes("deleted")) {
          return response;
        }
        throw error;
      }

      const recoveryLink = `${this.config.adminHomeUri}/#/reset-password?token=${token}`;
      const emailSent = await this.mailService.sendPasswordResetMail(
        email,
        recoveryLink,
        this.resetExpiryMs,
      );
      if (!emailSent) {
        return response.withErrorPromise(
          DomainErrorCodes.SYSTEM_ERROR,
          "Failed to send recovery email. Please try again later.",
        );
      }
      return response;
    } catch (error) {
      logger.err("Error requesting password reset:");
      logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error requesting password reset",
      );
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
      logger.err("Error verifying reset token:");
      logger.err(error as Error);
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

      try {
        new Password(password);
      } catch (error) {
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          (error as Error).message,
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
          DomainErrorCodes.INVALID_INPUT,
          RESET_REFUSALS[outcome],
        );
      }

      return response;
    } catch (error) {
      logger.err("Error resetting password:");
      logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error resetting password",
      );
    }
  }

  public async generateLink(
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
        logger.warn(
          `[ADMIN PASSWORD RESET ATTEMPT] Failed: Admin (ID: ${adminId}) tried to generate a recovery link for a User (ID: ${userId}) but user was not found.`,
        );
        return response;
      }

      let token: string;
      try {
        token = await this.tokenService.createResetToken(
          targetUser,
          this.resetExpiryMs,
          "ADMIN PASSWORD RESET ATTEMPT",
        );
      } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes("disabled") || msg.includes("deleted")) {
          return response;
        }
        throw error;
      }

      logger.info(
        `[AUDIT] Admin (ID: ${adminId}) generated a password reset link for User (ID: ${userId})`,
      );

      response.data = {
        recoveryUrl: `${this.config.adminHomeUri}/#/reset-password?token=${token}`,
      };
      return response;
    } catch (error) {
      logger.err("Error generating recovery link:");
      logger.err(error as Error);
      return response.withErrorPromise(
        DomainErrorCodes.SYSTEM_ERROR,
        "Error generating recovery link",
      );
    }
  }
}
