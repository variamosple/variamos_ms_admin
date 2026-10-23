import logger from "jet-logger";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import { PasswordResetTokenService } from "#src/Domain/User/Service/PasswordResetTokenService.js";
import {
  UserPasswordUseCase,
  type UserPasswordUseCaseConfig,
} from "./UserPasswordUseCase.js";

// The activity journal is checked by its own tests (T-24)
const activityJournal = { record: vi.fn().mockResolvedValue(undefined) };

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
    useCase = new UserPasswordUseCase(
      mockUserRepository,
      mockMailService,
      mockConfig,
      activityJournal,
    );
  });

  describe("requestReset", () => {
    it("should request password reset successfully when user is found and active", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      mockMailService.sendPasswordResetMail.mockResolvedValue(true);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      await vi.waitFor(() =>
        expect(mockMailService.sendPasswordResetMail).toHaveBeenCalled(),
      );
      expect(mockUserRepository.getUserByEmail).toHaveBeenCalledWith(
        "user@example.com",
      );
      expect(createTokenSpy).toHaveBeenCalledWith(
        mockUser,
        mockConfig.passwordResetExpiryInMs,
        "PASSWORD RESET ATTEMPT",
      );
      expect(mockMailService.sendPasswordResetMail).toHaveBeenCalledWith(
        "user@example.com",
        "http://localhost:3000/#/reset-password?token=generated-token",
        mockConfig.passwordResetExpiryInMs,
      );
      createTokenSpy.mockRestore();
    });

    it("should return empty response if user is not found", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(null);
      const createTokenSpy = vi.spyOn(
        PasswordResetTokenService.prototype,
        "createResetToken",
      );

      const req = new RequestModel("tx-1", "nonexistent@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      await vi.waitFor(() =>
        expect(mockUserRepository.getUserByEmail).toHaveBeenCalled(),
      );
      expect(createTokenSpy).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
      createTokenSpy.mockRestore();
    });

    it("should return empty response if token service throws validation error", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("User account is disabled."));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      await vi.waitFor(() => expect(createTokenSpy).toHaveBeenCalled());
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
      createTokenSpy.mockRestore();
    });

    it("answers success when the e-mail fails, and logs the failure", async () => {
      const errSpy = vi.spyOn(logger, "err").mockImplementation(() => {});
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      mockMailService.sendPasswordResetMail.mockResolvedValue(false);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      await vi.waitFor(() =>
        expect(errSpy).toHaveBeenCalledWith(
          "[PASSWORD RESET ATTEMPT] Failed: recovery e-mail not sent.",
        ),
      );
      createTokenSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("answers before the account lookup ends", async () => {
      let finishLookup: (user: User | null) => void = () => {};
      mockUserRepository.getUserByEmail.mockReturnValue(
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
      );

      const res = await useCase.requestReset(
        new RequestModel("tx-1", "user@example.com"),
      );

      expect(res.errorCode).toBeUndefined();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
      finishLookup(null);
    });
  });

  describe("verifyToken", () => {
    it("should verify token successfully when token is valid and not expired", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
        isUserActive: true,
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
        isUserActive: true,
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
        isUserActive: true,
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
        isUserActive: true,
      });
      mockUserRepository.resetPasswordWithToken.mockResolvedValue("reset");

      const req = new RequestModel("tx-1", {
        token: "token-123",
        password: "NewPassword123!",
      });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.resetPasswordWithToken).toHaveBeenCalledWith(
        "034192845dc489deca291f9f5ae0bb8e5472c991020bf64b3ebc6dec5a1d7e47",
        "NewPassword123!",
      );
    });

    it("should return verification error if token is invalid", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue(null);

      const req = new RequestModel("tx-1", {
        token: "expired-token",
        password: "NewPassword123!",
      });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(mockUserRepository.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("should return verification error if token is already used", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: new Date(),
        isUserActive: true,
      });

      const req = new RequestModel("tx-1", {
        token: "used-token",
        password: "NewPassword123!",
      });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token already used.");
      expect(mockUserRepository.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("should return SYSTEM_ERROR if resetPasswordAndUpdateToken throws a general error", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
        isUserActive: true,
      });
      mockUserRepository.resetPasswordWithToken.mockRejectedValue(
        new Error("Database connection lost"),
      );

      const req = new RequestModel("tx-1", {
        token: "token-123",
        password: "NewPassword123!",
      });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error resetting password");
    });
  });

  describe("reset link expiry", () => {
    it.each([
      ["a configured 24 hours", 24 * 60 * 60 * 1000, 60 * 60 * 1000],
      ["a configured 30 minutes", 30 * 60 * 1000, 30 * 60 * 1000],
      ["an invalid value", Number.NaN, 60 * 60 * 1000],
    ])("caps %s at one hour", async (_label, configured, expected) => {
      const capped = new UserPasswordUseCase(
        mockUserRepository,
        mockMailService,
        { ...mockConfig, passwordResetExpiryInMs: configured },
        activityJournal,
      );
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      mockMailService.sendPasswordResetMail.mockResolvedValue(true);

      await capped.requestReset(new RequestModel("tx-1", "user@example.com"));
      await vi.waitFor(() =>
        expect(mockMailService.sendPasswordResetMail).toHaveBeenCalled(),
      );

      expect(createTokenSpy).toHaveBeenCalledWith(
        mockUser,
        expected,
        "PASSWORD RESET ATTEMPT",
      );
      expect(mockMailService.sendPasswordResetMail).toHaveBeenCalledWith(
        "user@example.com",
        expect.any(String),
        expected,
      );
      createTokenSpy.mockRestore();
    });
  });

  describe("generateLink", () => {
    it("should generate a recovery link successfully for an active user", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockResolvedValue("generated-token");
      const loggerInfoSpy = vi
        .spyOn(logger, "info")
        .mockImplementation(() => {});

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-456",
      });
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
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("admin-456"),
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("user-123"),
      );
      createTokenSpy.mockRestore();
      loggerInfoSpy.mockRestore();
    });

    it("should return empty response if target user is not found", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(null),
      );
      const createTokenSpy = vi.spyOn(
        PasswordResetTokenService.prototype,
        "createResetToken",
      );
      const loggerWarnSpy = vi
        .spyOn(logger, "warn")
        .mockImplementation(() => {});

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-456",
      });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      expect(createTokenSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("admin-456"),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("user-123"),
      );
      createTokenSpy.mockRestore();
      loggerWarnSpy.mockRestore();
    });

    it("should return empty response if token service throws error", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("User account is disabled."));

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-456",
      });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      createTokenSpy.mockRestore();
    });

    it("should return INVALID_INPUT if request parameters are missing", async () => {
      const req = new RequestModel("tx-1", {
        userId: "",
        adminId: "admin-456",
      });
      const res = await useCase.generateLink(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("User ID and Admin ID are required.");
    });

    it("should return error if queryById returns error response", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "DB Error",
        ),
      );

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-456",
      });
      const res = await useCase.generateLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("DB Error");
    });

    it("should propagate errors other than account disabled/deleted from token service", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(mockUser),
      );
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("Unexpected token creation issue"));

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-456",
      });
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

    it("logs, without returning it, an error of the token service", async () => {
      const errSpy = vi.spyOn(logger, "err").mockImplementation(() => {});
      mockUserRepository.getUserByEmail.mockResolvedValue(mockUser);
      const createTokenSpy = vi
        .spyOn(PasswordResetTokenService.prototype, "createResetToken")
        .mockRejectedValue(new Error("General system crash"));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCase.requestReset(req);

      expect(res.errorCode).toBeUndefined();
      await vi.waitFor(() =>
        expect(errSpy).toHaveBeenCalledWith(
          "Error sending the password reset link:",
        ),
      );
      createTokenSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("should return error in verifyToken when token is empty", async () => {
      const req = new RequestModel("tx-1", "");
      const res = await useCase.verifyToken(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token is required.");
    });

    it("should catch errors in verifyToken and return SYSTEM_ERROR", async () => {
      mockUserRepository.getPasswordResetToken.mockRejectedValue(
        new Error("DB error"),
      );
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

    it("refuses the reset when another request consumed the token first", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        isUserActive: true,
      });
      mockUserRepository.resetPasswordWithToken.mockResolvedValue(
        "invalid_token",
      );

      const res = await useCase.resetPassword(
        new RequestModel("tx-1", {
          token: "token-123",
          password: "NewPassword123!",
        }),
      );

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Invalid token.");
    });

    it("refuses the reset when the account was disabled meanwhile", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        isUserActive: true,
      });
      mockUserRepository.resetPasswordWithToken.mockResolvedValue(
        "inactive_account",
      );

      const res = await useCase.resetPassword(
        new RequestModel("tx-1", {
          token: "token-123",
          password: "NewPassword123!",
        }),
      );

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Invalid token.");
    });

    it("refuses a link of a disabled or deleted account before any change", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        isUserActive: false,
      });

      const res = await useCase.resetPassword(
        new RequestModel("tx-1", {
          token: "token-123",
          password: "NewPassword123!",
        }),
      );

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Invalid token.");
      expect(mockUserRepository.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("applies the password rule on the server before touching the token", async () => {
      const res = await useCase.resetPassword(
        new RequestModel("tx-1", { token: "token-123", password: "short" }),
      );

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toContain("Password must be between 8 and 64");
      expect(mockUserRepository.getPasswordResetToken).not.toHaveBeenCalled();
      expect(mockUserRepository.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("should return specific message if password reset fails because new password is same as old", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
        isUserActive: true,
      });
      mockUserRepository.resetPasswordWithToken.mockResolvedValue(
        "same_password",
      );

      const req = new RequestModel("tx-1", {
        token: "token-123",
        password: "NewPassword123!",
      });
      const res = await useCase.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.PASSWORD_REUSED);
      expect(res.message).toBe(
        "New password cannot be the same as the old password.",
      );
    });
  });
});
