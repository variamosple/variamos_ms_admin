import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { PasswordResetTokenService } from "@src/Domain/User/Service/PasswordResetTokenService";
import crypto from "crypto";
import logger from "jet-logger";

export interface UserPasswordUseCaseConfig {
  passwordResetExpiryInMs: number;
  adminHomeUri: string;
}

export class UserPasswordUseCase {
  private readonly tokenService: PasswordResetTokenService;

  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly mailService: IMailService,
    private readonly config: UserPasswordUseCaseConfig,
  ) {
    this.tokenService = new PasswordResetTokenService(userRepository);
  }

  public async requestReset(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const email = request.data || "";
      if (!email) {
        return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Email is required.");
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
          this.config.passwordResetExpiryInMs,
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
      const emailSent = await this.mailService.sendPasswordResetMail(email, recoveryLink);
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

  public async verifyToken(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const token = request.data || "";
      if (!token) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Token is required.");
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const dbToken = await this.userRepository.getPasswordResetToken(tokenHash);

      if (!dbToken) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Invalid token.");
      }

      if (dbToken.usedAt) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Token already used.");
      }

      if (new Date() > new Date(dbToken.expiresAt)) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, "Token expired.");
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

      // Verify token validity
      const verifyRequest = new RequestModel<string>(request.transactionId, token);
      const verifyRes = await this.verifyToken(verifyRequest);
      if (verifyRes.errorCode) {
        return response.withError(verifyRes.errorCode, verifyRes.message || "Invalid token.");
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const dbToken = await this.userRepository.getPasswordResetToken(tokenHash);
      if (!dbToken) {
        return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Invalid token.");
      }
      const userId = dbToken.userId;

      // Reset password in repository
      await this.userRepository.resetPasswordAndUpdateToken(userId, password, tokenHash);

      return response;
    } catch (error) {
      logger.err("Error resetting password:");
      logger.err(error as Error);

      const errorMessage = error instanceof Error ? error.message : "Error resetting password";
      if (errorMessage.includes("New password cannot be the same as the old password")) {
        return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, errorMessage);
      }

      return response.withErrorPromise(DomainErrorCodes.SYSTEM_ERROR, "Error resetting password");
    }
  }

  public async generateLink(
    request: RequestModel<{ userId: string; adminId: string }>,
  ): Promise<ResponseModel<{ recoveryUrl: string }>> {
    const response = new ResponseModel<{ recoveryUrl: string }>(request.transactionId);
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
          this.config.passwordResetExpiryInMs,
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
