import { UsersUseCases } from "./UserUseCases";
import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import { MailServiceInstance } from "@src/Infrastructure/Mail/MailService";
import { RequestModel } from "../Core/Entity/RequestModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

jest.mock("@src/DataProviders/User/UserRepository");
jest.mock("@src/Infrastructure/Mail/MailService");

describe("UsersUseCases - Password Reset", () => {
  let useCases: UsersUseCases;

  beforeEach(() => {
    jest.clearAllMocks();
    useCases = new UsersUseCases();
  });

  describe("requestPasswordReset", () => {
    test("should request password reset successfully when user is active", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockResolvedValue({
        id: "user-123",
        isEnabled: true,
        isDeleted: false,
      });
      (
        UserRepositoryInstance.savePasswordResetToken as jest.Mock
      ).mockResolvedValue(undefined);
      (
        MailServiceInstance.sendPasswordResetMail as jest.Mock
      ).mockResolvedValue(true);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(UserRepositoryInstance.getUserByEmail).toHaveBeenCalledWith(
        "user@example.com",
      );
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).toHaveBeenCalledWith("user-123", expect.any(String), expect.any(Date));
      expect(MailServiceInstance.sendPasswordResetMail).toHaveBeenCalledWith(
        "user@example.com",
        expect.stringContaining("reset-password?token="),
      );
    });

    test("should return empty response (no error) if user is not found", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockResolvedValue(
        null,
      );

      const req = new RequestModel("tx-1", "nonexistent@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).not.toHaveBeenCalled();
      expect(MailServiceInstance.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return empty response (no error) if user is disabled", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockResolvedValue({
        id: "user-123",
        isEnabled: false,
        isDeleted: false,
      });

      const req = new RequestModel("tx-1", "disabled@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).not.toHaveBeenCalled();
      expect(MailServiceInstance.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return empty response (no error) if user is deleted", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockResolvedValue({
        id: "user-123",
        isEnabled: true,
        isDeleted: true,
      });

      const req = new RequestModel("tx-1", "deleted@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).not.toHaveBeenCalled();
      expect(MailServiceInstance.sendPasswordResetMail).not.toHaveBeenCalled();
    });

    test("should return INTERNAL_SERVER_ERROR if mail service fails to send email", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockResolvedValue({
        id: "user-123",
        isEnabled: true,
        isDeleted: false,
      });
      (
        UserRepositoryInstance.savePasswordResetToken as jest.Mock
      ).mockResolvedValue(undefined);
      (
        MailServiceInstance.sendPasswordResetMail as jest.Mock
      ).mockResolvedValue(false);

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.message).toBe(
        "Failed to send recovery email. Please try again later.",
      );
    });

    test("should return INTERNAL_SERVER_ERROR if repository throws an error", async () => {
      (UserRepositoryInstance.getUserByEmail as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.message).toBe("Error requesting password reset");
    });
  });

  describe("verifyPasswordResetToken", () => {
    test("should verify token successfully when token is valid and not expired", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "valid-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBeUndefined();
    });

    test("should return BAD_REQUEST if token is not found in db", async () => {
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue(null);

      const req = new RequestModel("tx-1", "invalid-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(res.message).toBe("Invalid token.");
    });

    test("should return BAD_REQUEST if token has already been used", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: new Date(),
      });

      const req = new RequestModel("tx-1", "used-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(res.message).toBe("Token already used.");
    });

    test("should return BAD_REQUEST if token is expired", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: yesterday,
        usedAt: null,
      });

      const req = new RequestModel("tx-1", "expired-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(res.message).toBe("Token expired.");
    });

    test("should return INTERNAL_SERVER_ERROR if getPasswordResetToken throws", async () => {
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", "some-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.message).toBe("Error verifying reset token");
    });
  });

  describe("resetPassword", () => {
    test("should reset password successfully", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      (
        UserRepositoryInstance.resetPasswordAndUpdateToken as jest.Mock
      ).mockResolvedValue(undefined);

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(
        UserRepositoryInstance.resetPasswordAndUpdateToken,
      ).toHaveBeenCalledWith("user-123", "NewPassword123!", expect.any(String));
    });

    test("should return error if token verification fails", async () => {
      // Mock verify to fail by resolving with null for the token lookup
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue(null);

      const req = new RequestModel("tx-1", {
        token: "invalid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(res.message).toBe("Invalid token.");
      expect(
        UserRepositoryInstance.resetPasswordAndUpdateToken,
      ).not.toHaveBeenCalled();
    });

    test("should return BAD_REQUEST if new password is the same as the old password", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      (
        UserRepositoryInstance.resetPasswordAndUpdateToken as jest.Mock
      ).mockRejectedValue(
        new Error("New password cannot be the same as the old password."),
      );

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "SamePassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(res.message).toContain(
        "New password cannot be the same as the old password",
      );
    });

    test("should return INTERNAL_SERVER_ERROR if database save throws generic error", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (
        UserRepositoryInstance.getPasswordResetToken as jest.Mock
      ).mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      (
        UserRepositoryInstance.resetPasswordAndUpdateToken as jest.Mock
      ).mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);

      expect(res.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.message).toBe("Error resetting password");
    });
  });

  describe("generateRecoveryLink", () => {
    test("should generate recovery link successfully for active user", async () => {
      const activeUser = { id: "user-123", isEnabled: true, isDeleted: false };
      (UserRepositoryInstance.queryById as jest.Mock).mockResolvedValue({
        data: activeUser,
        errorCode: undefined,
      });
      (
        UserRepositoryInstance.savePasswordResetToken as jest.Mock
      ).mockResolvedValue(undefined);

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data?.recoveryUrl).toContain("reset-password?token=");
      expect(UserRepositoryInstance.queryById).toHaveBeenCalled();
      expect(UserRepositoryInstance.savePasswordResetToken).toHaveBeenCalled();
    });

    test("should return error if queryById fails", async () => {
      (UserRepositoryInstance.queryById as jest.Mock).mockResolvedValue({
        errorCode: HttpStatusCodes.NOT_FOUND,
        message: "User not found.",
      });

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBe(HttpStatusCodes.NOT_FOUND);
      expect(res.message).toBe("User not found.");
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).not.toHaveBeenCalled();
    });

    test("should return empty response if user is disabled or deleted", async () => {
      const inactiveUser = {
        id: "user-123",
        isEnabled: false,
        isDeleted: false,
      };
      (UserRepositoryInstance.queryById as jest.Mock).mockResolvedValue({
        data: inactiveUser,
        errorCode: undefined,
      });

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBeUndefined();
      expect(
        UserRepositoryInstance.savePasswordResetToken,
      ).not.toHaveBeenCalled();
    });

    test("should return INTERNAL_SERVER_ERROR if repository save throws an error", async () => {
      const activeUser = { id: "user-123", isEnabled: true, isDeleted: false };
      (UserRepositoryInstance.queryById as jest.Mock).mockResolvedValue({
        data: activeUser,
        errorCode: undefined,
      });
      (
        UserRepositoryInstance.savePasswordResetToken as jest.Mock
      ).mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.message).toBe("Error generating recovery link");
    });
  });
});
