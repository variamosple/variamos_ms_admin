import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { v4 as uuidv4 } from "uuid";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { PASSWORD_REGEXP } from "../Validations/ValidationConstants";
import { PASSWORD_FORMAT_ERROR } from "../Validations/ValidationMessages";
import { Credentials } from "./Entity/Credentials";
import { PasswordUpdate } from "./Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { UserRegistration } from "./Entity/UserRegistration";
import crypto from "crypto";
import logger from "jet-logger";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";

export interface UserUseCasesConfig {
  passwordResetExpiryInMs: number;
  adminHomeUri: string;
}

export class UsersUseCases {
  public constructor(
    private userRepository: IUserRepository,
    private mailService: IMailService,
    private roleRepository: IGuestRoleRepository,
    private config: UserUseCasesConfig,
  ) {}

  public queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>> {
    return this.userRepository.queryUsers(request);
  }

  public findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.findSessionUser(request);
  }

  public findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return this.userRepository.findOrCreateUser(request);
  }

  public signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return this.userRepository.signIn(request);
  }

  public signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const { name, email, password, passwordConfirmation } = (request.data ||
      {}) as Partial<UserRegistration>;

    if (!name || !email || !password || !passwordConfirmation) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Full name, Email and password, and password confirmation are required.",
      );
    }

    if (password !== passwordConfirmation) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Password and password confirmation do not match.",
      );
    }

    if (!PASSWORD_REGEXP.test(password)) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Password must be between 8 and 24 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.",
      );
    }

    return this.userRepository.signUp(request);
  }

  public queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.queryById(request);
  }

  public disableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.disableUser(request);
  }

  public enableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.enableUser(request);
  }

  public deleteUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.deleteUser(request);
  }

  public getMyAccount(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.queryById(request).then((response) => {
      if (response.data) {
        response.data = User.builder()
          .setId(response.data.id)
          .setName(response.data.name)
          .setEmail(response.data.email)
          .setUser(response.data.user)
          .setCountryCode(response.data.countryCode)
          .setCountryName(response.data.countryName)
          .build();
      }

      return response;
    });
  }

  public updatePassword(request: RequestModel<PasswordUpdate>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    const data = request.data;
    if (!data) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Password update data is required.",
      );
    }
    const currentPassword = data.getCurrentPassword();
    const newPassword = data.getNewPassword();
    const passwordConfirmation = data.getPasswordConfirmation();

    if (!currentPassword || !newPassword || !passwordConfirmation) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Current password, new password and password confirmation are required.",
      );
    }

    if (newPassword !== passwordConfirmation) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "New password and password confirmation do not match.",
      );
    }

    if (!PASSWORD_REGEXP.test(newPassword)) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, PASSWORD_FORMAT_ERROR);
    }

    return this.userRepository.updateUserPassword(request);
  }

  public updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    return this.userRepository.updatePersonalInformation(request);
  }

  public async getGuestData(request: RequestModel<string>): Promise<ResponseModel<User>> {
    let guestId = request.data || uuidv4();
    let userExists = false;
    const response = new ResponseModel<User>(request.transactionId);

    do {
      const existsResponse = await this.userRepository.userExists(
        new RequestModel<string>(request.transactionId, guestId),
      );

      if (existsResponse.errorCode) {
        return response.copyErrorWithPromise(existsResponse);
      }

      if (existsResponse.data) {
        guestId = uuidv4();
      }

      userExists = existsResponse.data || false;
    } while (userExists);

    const role = await this.roleRepository.queryGuestRole(
      new RequestModel<void>(request.transactionId),
    );
    const roles = role.data ? [role.data.name] : [];
    const permissions = role.data?.permissions
      ? role.data.permissions.map((permission) => permission.name)
      : [];

    response.data = User.builder()
      .setId(guestId)
      .setName("Guest")
      .setUser("Guest")
      .setEmail("guest@variamos.com")
      .setRoles(roles)
      .setPermissions(permissions)
      .build();

    return response;
  }

  public async requestPasswordReset(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const email = request.data || "";
      const user = await this.userRepository.getUserByEmail(email);

      if (!user) {
        logger.warn("[PASSWORD RESET ATTEMPT] Failed: Email not found.");
        return response;
      }

      if (!user.isEnabled) {
        logger.warn(`[PASSWORD RESET ATTEMPT] Failed: User account is disabled (ID: ${user.id}).`);
        return response;
      }

      if (user.isDeleted) {
        logger.warn(
          `[PASSWORD RESET ATTEMPT] Failed: User account is marked as deleted (ID: ${user.id}).`,
        );
        return response;
      }
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + this.config.passwordResetExpiryInMs);
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await this.userRepository.savePasswordResetToken(user.id || "", tokenHash, expiresAt);

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

  public async verifyPasswordResetToken(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const token = request.data || "";
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

      // 1. Double check token validity
      const verifyRequest = new RequestModel<string>(request.transactionId, token);
      const verifyRes = await this.verifyPasswordResetToken(verifyRequest);
      if (verifyRes.errorCode) {
        return response.withError(verifyRes.errorCode, verifyRes.message || "Invalid token.");
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const dbToken = await this.userRepository.getPasswordResetToken(tokenHash);
      if (!dbToken) {
        return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Invalid token.");
      }
      const userId = dbToken.userId;

      // 2. Save to database (which will check if new password is identical to the current one and hash it internally)
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

  public async generateRecoveryLink(
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

      if (!targetUser.isEnabled) {
        logger.warn(
          `[ADMIN PASSWORD RESET ATTEMPT] Failed: Admin (ID: ${adminId}) tried to generate a recovery link for User (ID: ${userId}) but user is disabled.`,
        );
        return response;
      }

      if (targetUser.isDeleted) {
        logger.warn(
          `[ADMIN PASSWORD RESET ATTEMPT] Failed: Admin (ID: ${adminId}) tried to generate a recovery link for User (ID: ${userId}) but user is marked as deleted.`,
        );
        return response;
      }
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + this.config.passwordResetExpiryInMs);
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await this.userRepository.savePasswordResetToken(targetUser.id || "", tokenHash, expiresAt);
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
