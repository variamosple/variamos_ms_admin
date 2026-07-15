import { mock, MockProxy } from "jest-mock-extended";
import { UserPasswordUseCase, UserPasswordUseCaseConfig } from "./UserPasswordUseCase";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { PasswordResetTokenService } from "@src/Domain/User/Service/PasswordResetTokenService";
import { User } from "@src/Domain/User/Entity/User";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import logger from "jet-logger";

describe("UserPasswordUseCase", () => {
  let useCase: UserPasswordUseCase;
  let mockUserRepository: MockProxy<IUserRepository>;
  let mockMailService: MockProxy<IMailService>;

  const mockConfig: UserPasswordUseCaseConfig = {
    passwordResetExpiryInMs: 3600000,
    adminHomeUri: "http://localhost:3000",
  };

  const mockUser = {
    id: "user-123",
    isEnabled: true,
    isDeleted: false,
    name: "Test User",
    email: "user@example.com",
    user: "testuser",
    roles: [],
    permissions: [],
    countryCode: null,
    countryName: null,
    createdAt: new Date(),
  } as User;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    mockMailService = mock<IMailService>();
    useCase = new UserPasswordUseCase(mockUserRepository, mockMailService, mockConfig);
  });

  describe("requestReset", () => {
    it("should request password reset successfully when user is found and active", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      mockMailService.sendPasswordResetMail.mockResolvedValue(true);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.getUserByEmail).toHaveBeenCalledWith("user@example.com");
      expect(createTokenSpy).toHaveBeenCalledWith(
        mockUser,
        mockConfig.passwordResetExpiryInMs,
        "PASSWORD RESET ATTEMPT",
      );
      expect(mockMailService.sendPasswordResetMail).toHaveBeenCalledWith(
        "user@example.com",
        "http://localhost:3000/#/reset-password?token=generated-token",
      );
      createTokenSpy.mockRestore();
    });

    it("should return empty response if user is not found", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(null);
      const createTokenSpy = jest.spyOn(PasswordResetTokenService.prototype, "createResetToken");

      const req = new RequestModel("tx-1", "nonexistent@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(createTokenSpy).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
      createTokenSpy.mockRestore();
    });

    it("should return empty response if token service throws validation error", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("User account is disabled."));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
      createTokenSpy.mockRestore();
    });

    it("should return SYSTEM_ERROR if mail service fails to send mail", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      mockMailService.sendPasswordResetMail.mockResolvedValue(false);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Failed to send recovery email. Please try again later.");
      createTokenSpy.mockRestore();
    });
  });

  describe("verifyToken", () => {
    it("should verify token successfully when token is valid and not expired", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "token-123");
      const res = await useCase.verifyToken(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.getPasswordResetToken).toHaveBeenCalled();
    });

    it("should return INVALID_INPUT if token is not found", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue(null);

      const req = new RequestModel("tx-1", "invalid-token");
      const res = await useCase.verifyToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Invalid token.");
    });

    it("should return INVALID_INPUT if token is already used", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: new Date(),
      });

      const req = new RequestModel("tx-1", "used-token");
      const res = await useCase.verifyToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token already used.");
    });

    it("should return INVALID_INPUT if token is expired", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: yesterday,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "expired-token");
      const res = await useCase.verifyToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token expired.");
    });
  });

  describe("resetPassword", () => {
    it("should reset password successfully when token is valid", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockResolvedValue(undefined);

      const req = new RequestModel("tx-1", { token: "token-123", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.resetPasswordAndUpdateToken).toHaveBeenCalledWith(
        "user-123",
        "NewPassword123!",
        "034192845dc489deca291f9f5ae0bb8e5472c991020bf64b3ebc6dec5a1d7e47",
      );
    });

    it("should return verification error if token is invalid", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue(null);

      const req = new RequestModel("tx-1", { token: "expired-token", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(mockUserRepository.resetPasswordAndUpdateToken).not.toHaveBeenCalled();
    });

    it("should return verification error if token is already used", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: new Date(),
      });

      const req = new RequestModel("tx-1", { token: "used-token", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token already used.");
      expect(mockUserRepository.resetPasswordAndUpdateToken).not.toHaveBeenCalled();
    });

    it("should return SYSTEM_ERROR if resetPasswordAndUpdateToken throws a general error", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockRejectedValue(
        new Error("Database connection lost"),
      );

      const req = new RequestModel("tx-1", { token: "token-123", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error resetting password");
    });
  });

  describe("generateLink", () => {
    it("should generate a recovery link successfully for an active user", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      const req = new RequestModel("tx-1", { userId: "user-123", adminId: "admin-456" });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data?.recoveryUrl).toBe(
        "http://localhost:3000/#/reset-password?token=generated-token",
      );
      expect(mockUserRepository.queryById).toHaveBeenCalled();
      expect(createTokenSpy).toHaveBeenCalledWith(
        mockUser,
        mockConfig.passwordResetExpiryInMs,
        "ADMIN PASSWORD RESET ATTEMPT",
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("admin-456"));
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("user-123"));
      createTokenSpy.mockRestore();
      loggerInfoSpy.mockRestore();
    });

    it("should return empty response if target user is not found", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(null),
      );
      const createTokenSpy = jest.spyOn(PasswordResetTokenService.prototype, "createResetToken");
      const loggerWarnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      const req = new RequestModel("tx-1", { userId: "user-123", adminId: "admin-456" });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      expect(createTokenSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("admin-456"));
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("user-123"));
      createTokenSpy.mockRestore();
      loggerWarnSpy.mockRestore();
    });

    it("should return empty response if token service throws error", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("User account is disabled."));

      const req = new RequestModel("tx-1", { userId: "user-123", adminId: "admin-456" });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      createTokenSpy.mockRestore();
    });

    it("should return INVALID_INPUT if request parameters are missing", async () => {
      const req = new RequestModel("tx-1", { userId: "", adminId: "admin-456" });
      const res = await useCase.generateLink(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("User ID and Admin ID are required.");
    });

    it("should return error if queryById returns error response", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withError(DomainErrorCodes.SYSTEM_ERROR, "DB Error"),
      );

      const req = new RequestModel("tx-1", { userId: "user-123", adminId: "admin-456" });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("DB Error");
    });

    it("should propagate errors other than account disabled/deleted from token service", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("Unexpected token creation issue"));

      const req = new RequestModel("tx-1", { userId: "user-123", adminId: "admin-456" });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error generating recovery link");
      createTokenSpy.mockRestore();
    });
  });

  describe("extra branch logic tests", () => {
    it("should return error in requestReset when email is empty", async () => {
      const req = new RequestModel("tx-1", "");
      const res = await useCase.requestReset(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Email is required.");
    });

    it("should propagate errors in requestReset when token service throws general error", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = jest
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("General system crash"));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error requesting password reset");
      createTokenSpy.mockRestore();
    });

    it("should return error in verifyToken when token is empty", async () => {
      const req = new RequestModel("tx-1", "");
      const res = await useCase.verifyToken(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token is required.");
    });

    it("should catch errors in verifyToken and return SYSTEM_ERROR", async () => {
      mockUserRepository.getPasswordResetToken.mockRejectedValue(new Error("DB error"));
      const req = new RequestModel("tx-1", "token-abc");
      const res = await useCase.verifyToken(req);
      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error verifying reset token");
    });

    it("should return error in resetPassword when parameters are missing", async () => {
      const req = new RequestModel("tx-1", { token: "", password: "Pass" });
      const res = await useCase.resetPassword(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token and password are required.");
    });

    it("should return error in resetPassword if verifyToken passes but token hash is missing in DB", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      // First call for verifyToken succeeds, second call returns null
      mockUserRepository.getPasswordResetToken
        .mockResolvedValueOnce({
          userId: "user-123",
          expiresAt: tomorrow,
          usedAt: null,
        })
        .mockResolvedValueOnce(null);

      const req = new RequestModel("tx-1", { token: "token-123", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Invalid token.");
    });

    it("should return specific message if password reset fails because new password is same as old", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockRejectedValue(
        new Error("New password cannot be the same as the old password"),
      );

      const req = new RequestModel("tx-1", { token: "token-123", password: "NewPassword123!" });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("New password cannot be the same as the old password");
    });
  });
});
