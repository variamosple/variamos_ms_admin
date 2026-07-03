/* eslint-disable @typescript-eslint/unbound-method */
import { UsersUseCases } from "./UserUseCases";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { IUserRepository } from "./IUserRepository";
import { IMailService } from "../Mail/IMailService";
import { IRoleRepository } from "../Role/IRoleRepository";
import { User } from "./Entity/User";

describe("UsersUseCases - Unit Tests", () => {
  let useCases: UsersUseCases;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockMailService: jest.Mocked<IMailService>;
  let mockRoleRepository: jest.Mocked<IRoleRepository>;
  const mockConfig = {
    passwordResetExpiryInMs: 3600000, // 1 hour
    homeRedirectUri: "http://localhost:3000",
  };

  beforeEach(() => {
    mockUserRepository = {
      queryUsers: jest.fn(),
      findSessionUser: jest.fn(),
      findOrCreateUser: jest.fn(),
      signIn: jest.fn(),
      signUp: jest.fn(),
      queryById: jest.fn(),
      disableUser: jest.fn(),
      enableUser: jest.fn(),
      deleteUser: jest.fn(),
      updateUserPassword: jest.fn(),
      updatePersonalInformation: jest.fn(),
      userExists: jest.fn(),
      getUserByEmail: jest.fn(),
      savePasswordResetToken: jest.fn(),
      getPasswordResetToken: jest.fn(),
      resetPasswordAndUpdateToken: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockMailService = {
      sendPasswordResetMail: jest.fn(),
    } as jest.Mocked<IMailService>;

    mockRoleRepository = {
      queryGuestRole: jest.fn(),
    } as jest.Mocked<IRoleRepository>;

    useCases = new UsersUseCases(
      mockUserRepository,
      mockMailService,
      mockRoleRepository,
      mockConfig,
    );
  });

  describe("requestPasswordReset", () => {
    test("should request password reset successfully when user is active", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue({
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
      } as User);
      mockUserRepository.savePasswordResetToken.mockResolvedValue(undefined);
      mockMailService.sendPasswordResetMail.mockResolvedValue(true);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.getUserByEmail).toHaveBeenCalledWith("user@example.com");
      expect(mockUserRepository.savePasswordResetToken).toHaveBeenCalledWith(
        "user-123",
        expect.any(String),
        expect.any(Date),
      );
      expect(mockMailService.sendPasswordResetMail).toHaveBeenCalledWith(
        "user@example.com",
        expect.stringContaining("reset-password?token="),
      );
    });

    test("should return empty response (no error) if user is not found", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue(null);

      const req = new RequestModel("tx-1", "nonexistent@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return empty response (no error) if user is disabled", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue({
        id: "user-123",
        isEnabled: false,
        isDeleted: false,
        name: "Test User",
        email: "user@example.com",
        user: "testuser",
        roles: [],
        permissions: [],
        countryCode: null,
        countryName: null,
        createdAt: new Date(),
      } as User);

      const req = new RequestModel("tx-1", "disabled@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return empty response (no error) if user is deleted", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue({
        id: "user-123",
        isEnabled: true,
        isDeleted: true,
        name: "Test User",
        email: "user@example.com",
        user: "testuser",
        roles: [],
        permissions: [],
        countryCode: null,
        countryName: null,
        createdAt: new Date(),
      } as User);

      const req = new RequestModel("tx-1", "deleted@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return INTERNAL_ERROR if mail service fails to send email", async () => {
      mockUserRepository.getUserByEmail.mockResolvedValue({
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
      } as User);
      mockUserRepository.savePasswordResetToken.mockResolvedValue(undefined);
      mockMailService.sendPasswordResetMail.mockResolvedValue(false);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(res.message).toBe("Failed to send recovery email. Please try again later.");
    });

    test("should return INTERNAL_ERROR if repository throws an error", async () => {
      mockUserRepository.getUserByEmail.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(res.message).toBe("Error requesting password reset");
    });
  });

  describe("verifyPasswordResetToken", () => {
    test("should verify token successfully when token is valid and not expired", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "valid-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBeUndefined();
    });

    test("should return BAD_REQUEST if token is not found in db", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue(null);

      const req = new RequestModel("tx-1", "invalid-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(res.message).toBe("Invalid token.");
    });

    test("should return BAD_REQUEST if token has already been used", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: new Date(),
      });

      const req = new RequestModel("tx-1", "used-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(res.message).toBe("Token already used.");
    });

    test("should return BAD_REQUEST if token is expired", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: yesterday,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "expired-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(res.message).toBe("Token expired.");
    });

    test("should return INTERNAL_ERROR if getPasswordResetToken throws", async () => {
      mockUserRepository.getPasswordResetToken.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", "some-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(res.message).toBe("Error verifying reset token");
    });
  });

  describe("resetPassword", () => {
    test("should reset password successfully", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockResolvedValue(undefined);

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.resetPasswordAndUpdateToken).toHaveBeenCalledWith(
        "user-123",
        "NewPassword123!",
        expect.any(String),
      );
    });

    test("should return error if token verification fails", async () => {
      mockUserRepository.getPasswordResetToken.mockResolvedValue(null);

      const req = new RequestModel("tx-1", {
        token: "invalid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(res.message).toBe("Invalid token.");
      expect(mockUserRepository.resetPasswordAndUpdateToken).not.toHaveBeenCalled();
    });

    test("should return BAD_REQUEST if new password is the same as the old password", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockRejectedValue(
        new Error("New password cannot be the same as the old password."),
      );

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "SamePassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(res.message).toContain("New password cannot be the same as the old password");
    });

    test("should return INTERNAL_ERROR if database save throws generic error", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(res.message).toBe("Error resetting password");
    });
  });

  describe("generateRecoveryLink", () => {
    test("should generate recovery link successfully for active user", async () => {
      const activeUser = {
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
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("queryById").withResponse(activeUser),
      );
      mockUserRepository.savePasswordResetToken.mockResolvedValue(undefined);

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data?.recoveryUrl).toContain("reset-password?token=");
      expect(mockUserRepository.queryById).toHaveBeenCalled();
      expect(mockUserRepository.savePasswordResetToken).toHaveBeenCalled();
    });

    test("should return error if queryById fails", async () => {
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("queryById").withError(
          DomainErrorCodes.NOT_FOUND,
          "User not found.",
        ),
      );

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.NOT_FOUND);
      expect(res.message).toBe("User not found.");
      expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
    });

    test("should return empty response if user is disabled or deleted", async () => {
      const inactiveUser = {
        id: "user-123",
        isEnabled: false,
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
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("queryById").withResponse(inactiveUser),
      );

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
    });

    test("should return INTERNAL_ERROR if repository save throws an error", async () => {
      const activeUser = {
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
      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("queryById").withResponse(activeUser),
      );
      mockUserRepository.savePasswordResetToken.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(res.message).toBe("Error generating recovery link");
    });
  });
});
