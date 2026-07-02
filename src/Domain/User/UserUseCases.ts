import HttpStatusCodes from "@src/common/HttpStatusCodes";
import EnvVars from "@src/common/EnvVars";
import { RoleRepositoryInstance } from "@src/DataProviders/Role/RoleRepository";
import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
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
import { MailServiceInstance } from "@src/Infrastructure/Mail/MailService";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";

export class UsersUseCases {
  constructor(
    private userRepository: IUserRepository = UserRepositoryInstance,
    private mailService: IMailService = MailServiceInstance,
  ) {}

  queryUsers(
    request: RequestModel<UserFilter>,
  ): Promise<ResponseModel<User[]>> {
    return this.userRepository.queryUsers(request);
  }

  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.findSessionUser(request);
  }

  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return this.userRepository.findOrCreateUser(request);
  }

  signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return this.userRepository.signIn(request);
  }

  signUp(
    request: RequestModel<UserRegistration>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const { name, email, password, passwordConfirmation } = request.data!;

    if (!name || !email || !password || !passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Full name, Email and password, and password confirmation are required.",
      );
    }

    if (password !== passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Password and password confirmation do not match.",
      );
    }

    if (!PASSWORD_REGEXP.test(password)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Password must be between 8 and 24 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.",
      );
    }

    if (!PASSWORD_REGEXP.test(password)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        PASSWORD_FORMAT_ERROR,
      );
    }

    return this.userRepository.signUp(request);
  }

  queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.queryById(request);
  }

  disableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return this.userRepository.disableUser(request);
  }

  enableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return this.userRepository.enableUser(request);
  }

  deleteUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return this.userRepository.deleteUser(request);
  }

  getMyAccount(request: RequestModel<string>): Promise<ResponseModel<User>> {
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

  updatePassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    const data = request.data!;
    const currentPassword = data.getCurrentPassword();
    const newPassword = data.getNewPassword();
    const passwordConfirmation = data.getPasswordConfirmation();

    if (!currentPassword || !newPassword || !passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Current password, new password and password confirmation are required.",
      );
    }

    if (newPassword !== passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "New password and password confirmation do not match.",
      );
    }

    if (!PASSWORD_REGEXP.test(newPassword)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        PASSWORD_FORMAT_ERROR,
      );
    }

    return this.userRepository.updateUserPassword(request);
  }

  updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    return this.userRepository.updatePersonalInformation(request);
  }

  async getGuestData(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    let guestId = request.data || uuidv4();
    let userExists = false;
    const response = new ResponseModel<User>(request.transactionId);

    do {
      const existsReponse = await this.userRepository.userExists(
        new RequestModel<string>(request.transactionId, guestId),
      );

      if (existsReponse.errorCode) {
        return response.copyErrorWithPromise(existsReponse);
      }

      if (existsReponse.data) {
        guestId = uuidv4();
      }

      userExists = existsReponse.data!;
    } while (userExists);

    const role = await RoleRepositoryInstance.queryGuestRole(request);
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

  async requestPasswordReset(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const email = request.data!;
      const user = await this.userRepository.getUserByEmail(email);

      if (!user) {
        logger.warn("[PASSWORD RESET ATTEMPT] Failed: Email not found.");
        return response;
      }

      if (!user.isEnabled) {
        logger.warn(
          `[PASSWORD RESET ATTEMPT] Failed: User account is disabled (ID: ${user.id}).`,
        );
        return response;
      }

      if (user.isDeleted) {
        logger.warn(
          `[PASSWORD RESET ATTEMPT] Failed: User account is marked as deleted (ID: ${user.id}).`,
        );
        return response;
      }
      const token = uuidv4();
      const expiresAt = new Date(
        Date.now() + EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
      );
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await this.userRepository.savePasswordResetToken(
        user.id!,
        tokenHash,
        expiresAt,
      );

      const recoveryLink = `${EnvVars.Auth.APP.HOME_REDIRECT_URI}/#/reset-password?token=${token}`;
      const emailSent = await this.mailService.sendPasswordResetMail(
        email,
        recoveryLink,
      );
      if (!emailSent) {
        return response.withErrorPromise(
          HttpStatusCodes.INTERNAL_SERVER_ERROR,
          "Failed to send recovery email. Please try again later.",
        );
      }
      return response;
    } catch (error) {
      logger.err("Error requesting password reset:", error);
      return response.withErrorPromise(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Error requesting password reset",
      );
    }
  }

  async verifyPasswordResetToken(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const token = request.data!;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const dbToken =
        await this.userRepository.getPasswordResetToken(tokenHash);

      if (!dbToken) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Invalid token.",
        );
      }

      if (dbToken.usedAt) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Token already used.",
        );
      }

      if (new Date() > new Date(dbToken.expiresAt)) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Token expired.",
        );
      }

      return response;
    } catch (error) {
      logger.err("Error verifying reset token:", error);
      return response.withErrorPromise(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Error verifying reset token",
      );
    }
  }

  async resetPassword(
    request: RequestModel<{ token: string; password: string }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const { token, password } = request.data!;

      // 1. Double check token validity
      const verifyRequest = new RequestModel<string>(
        request.transactionId!,
        token,
      );
      const verifyRes = await this.verifyPasswordResetToken(verifyRequest);
      if (verifyRes.errorCode) {
        return response.withError(
          verifyRes.errorCode,
          verifyRes.message || "Invalid token.",
        );
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const dbToken =
        await this.userRepository.getPasswordResetToken(tokenHash);
      const userId = dbToken!.userId;

      // 2. Save to database (which will check if new password is identical to the current one and hash it internally)
      await this.userRepository.resetPasswordAndUpdateToken(
        userId,
        password,
        tokenHash,
      );

      return response;
    } catch (error: any) {
      logger.err("Error resetting password:", error);

      const errorMessage = error?.message || "Error resetting password";
      if (
        errorMessage.includes(
          "New password cannot be the same as the old password",
        )
      ) {
        return response.withErrorPromise(
          HttpStatusCodes.BAD_REQUEST,
          errorMessage,
        );
      }

      return response.withErrorPromise(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Error resetting password",
      );
    }
  }

  async generateRecoveryLink(
    request: RequestModel<{ userId: string; adminId: string }>,
  ): Promise<ResponseModel<{ recoveryUrl: string }>> {
    const response = new ResponseModel<{ recoveryUrl: string }>(
      request.transactionId,
    );
    try {
      const { userId, adminId } = request.data!;
      const userResponse = await this.userRepository.queryById(
        new RequestModel<string>(request.transactionId, userId),
      );

      if (userResponse.errorCode) {
        return response.withError(
          userResponse.errorCode,
          userResponse.message || "Error getting user.",
        );
      }

      const targetUser = userResponse.data;

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
      const expiresAt = new Date(
        Date.now() + EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
      );
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      await this.userRepository.savePasswordResetToken(
        targetUser.id!,
        tokenHash,
        expiresAt,
      );
      logger.info(
        `[AUDIT] Admin (ID: ${adminId}) generated a password reset link for User (ID: ${userId})`,
      );
      response.data = {
        recoveryUrl: `${EnvVars.Auth.APP.HOME_REDIRECT_URI}/#/reset-password?token=${token}`,
      };
      return response;
    } catch (error) {
      logger.err("Error generating recovery link:", error);
      return response.withErrorPromise(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Error generating recovery link",
      );
    }
  }
}
