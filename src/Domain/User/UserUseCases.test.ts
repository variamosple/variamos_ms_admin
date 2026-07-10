import { UsersUseCases } from "./UserUseCases";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { IUserRepository } from "./IUserRepository";
import { IMailService } from "../Mail/IMailService";
import { IGuestRoleRepository } from "../Role/Repository/IGuestRoleRepository";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { Credentials } from "./Entity/Credentials";
import { UserRegistration } from "./Entity/UserRegistration";
import { PasswordUpdate } from "./Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate";
import { Role } from "../Role/Entity/Role";
import { Permission } from "../Permission/Entity/Permission";

import { mock, MockProxy } from "jest-mock-extended";

describe("UsersUseCases - Unit Tests", () => {
  let useCases: UsersUseCases;
  let mockUserRepository: MockProxy<IUserRepository>;
  let mockMailService: MockProxy<IMailService>;
  let mockRoleRepository: MockProxy<IGuestRoleRepository>;
  const mockConfig = {
    passwordResetExpiryInMs: 3600000, // 1 hour
    adminHomeUri: "http://localhost:3000",
  };

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    mockMailService = mock<IMailService>();
    mockRoleRepository = mock<IGuestRoleRepository>();

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

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Failed to send recovery email. Please try again later.");
    });

    test("should return INTERNAL_ERROR if repository throws an error", async () => {
      mockUserRepository.getUserByEmail.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", "user@example.com");
      const res = await useCases.requestPasswordReset(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
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

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
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

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
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

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token expired.");
    });

    test("should return INTERNAL_ERROR if getPasswordResetToken throws", async () => {
      mockUserRepository.getPasswordResetToken.mockRejectedValue(new Error("DB error"));

      const req = new RequestModel("tx-1", "some-token");
      const res = await useCases.verifyPasswordResetToken(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
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

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
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

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
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

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error resetting password");
    });

    test("should return BAD_REQUEST if token or password is missing in resetPassword", async () => {
      const req = new RequestModel("tx-1", {
        token: "",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Token and password are required.");
    });

    test("should return INTERNAL_ERROR if resetPassword throws a non-Error string object", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockUserRepository.getPasswordResetToken.mockResolvedValue({
        userId: "user-123",
        expiresAt: tomorrow,
        usedAt: null,
      });
      mockUserRepository.resetPasswordAndUpdateToken.mockRejectedValue("string rejection error");

      const req = new RequestModel("tx-1", {
        token: "valid-token",
        password: "NewPassword123!",
      });
      const res = await useCases.resetPassword(req);
      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
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
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        ),
      );

      const req = new RequestModel("tx-1", {
        userId: "user-123",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
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

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Error generating recovery link");
    });

    test("should return BAD_REQUEST if userId or adminId is missing in generateRecoveryLink", async () => {
      const req = new RequestModel("tx-1", {
        userId: "",
        adminId: "admin-999",
      });
      const res = await useCases.generateRecoveryLink(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("User ID and Admin ID are required.");
    });
  });

  describe("Other operations", () => {
    test("should query users", async () => {
      const filter = new UserFilter();
      const mockUsers = [
        User.builder()
          .setId("1")
          .setUser("u1")
          .setName("N1")
          .setEmail("e1@e.com")
          .setIsEnabled(true)
          .setIsDeleted(false)
          .setCreatedAt(new Date())
          .build(),
      ];
      const mockResponse = new ResponseModel<User[]>("tx-1").withResponse(mockUsers);
      mockUserRepository.queryUsers.mockResolvedValue(mockResponse);

      const req = new RequestModel<UserFilter>("tx-1", filter);
      const res = await useCases.queryUsers(req);
      expect(res.data).toBe(mockUsers);
    });

    test("should find session user", async () => {
      const mockUser = User.builder()
        .setId("1")
        .setUser("u1")
        .setName("N1")
        .setEmail("e1@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.findSessionUser.mockResolvedValue(mockResponse);

      const req = new RequestModel<string>("tx-1", "session-token");
      const res = await useCases.findSessionUser(req);
      expect(res.data).toBe(mockUser);
    });

    test("should find or create user", async () => {
      const mockUser = User.builder()
        .setId("1")
        .setUser("u1")
        .setName("N1")
        .setEmail("e1@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.findOrCreateUser.mockResolvedValue(mockResponse);

      const req = new RequestModel<User>("tx-1", mockUser);
      const res = await useCases.findOrCreateUser(req);
      expect(res.data).toBe(mockUser);
    });

    test("should sign in", async () => {
      const credentials = new Credentials("test@e.com", "Password123!");
      const mockUser = User.builder()
        .setId("1")
        .setUser("u1")
        .setName("N1")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.signIn.mockResolvedValue(mockResponse);

      const req = new RequestModel<Credentials>("tx-1", credentials);
      const res = await useCases.signIn(req);
      expect(res.data).toBe(mockUser);
    });

    describe("signUp", () => {
      test("should fail if required fields are missing", async () => {
        const reg = new UserRegistration("", "", "", "");
        const req = new RequestModel<UserRegistration>("tx-1", reg);
        const res = await useCases.signUp(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should fail if password does not match confirmation", async () => {
        const reg = new UserRegistration("Name", "test@e.com", "Password123!", "OtherPass!");
        const req = new RequestModel<UserRegistration>("tx-1", reg);
        const res = await useCases.signUp(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
        expect(res.message).toBe("Password and password confirmation do not match.");
      });

      test("should fail if password does not match complex regexp pattern", async () => {
        const reg = new UserRegistration("Name", "test@e.com", "simple", "simple");
        const req = new RequestModel<UserRegistration>("tx-1", reg);
        const res = await useCases.signUp(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should signup successfully if inputs are valid", async () => {
        const reg = new UserRegistration("Name", "test@e.com", "Password123!", "Password123!");
        const mockUser = User.builder()
          .setId("1")
          .setUser("u1")
          .setName("Name")
          .setEmail("test@e.com")
          .setIsEnabled(true)
          .setIsDeleted(false)
          .setCreatedAt(new Date())
          .build();
        const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
        mockUserRepository.signUp.mockResolvedValue(mockResponse);

        const req = new RequestModel<UserRegistration>("tx-1", reg);
        const res = await useCases.signUp(req);
        expect(res.data).toBe(mockUser);
      });
    });

    test("should disable user", async () => {
      const mockResponse = new ResponseModel<void>("tx-1");
      mockUserRepository.disableUser.mockResolvedValue(mockResponse);
      const req = new RequestModel<string>("tx-1", "user-123");
      const res = await useCases.disableUser(req);
      expect(res.errorCode).toBeUndefined();
    });

    test("should enable user", async () => {
      const mockResponse = new ResponseModel<void>("tx-1");
      mockUserRepository.enableUser.mockResolvedValue(mockResponse);
      const req = new RequestModel<string>("tx-1", "user-123");
      const res = await useCases.enableUser(req);
      expect(res.errorCode).toBeUndefined();
    });

    test("should delete user", async () => {
      const mockResponse = new ResponseModel<void>("tx-1");
      mockUserRepository.deleteUser.mockResolvedValue(mockResponse);
      const req = new RequestModel<string>("tx-1", "user-123");
      const res = await useCases.deleteUser(req);
      expect(res.errorCode).toBeUndefined();
    });

    describe("getMyAccount", () => {
      test("should map the returned user to a secure version containing basic properties", async () => {
        const user = User.builder()
          .setId("1")
          .setUser("u1")
          .setName("N1")
          .setEmail("e1@e.com")
          .setCountryCode("FR")
          .setCountryName("France")
          .setIsEnabled(true)
          .setIsDeleted(false)
          .setCreatedAt(new Date())
          .build();
        const mockResponse = new ResponseModel<User>("tx-1").withResponse(user);
        mockUserRepository.queryById.mockResolvedValue(mockResponse);

        const req = new RequestModel<string>("tx-1", "user-123");
        const res = await useCases.getMyAccount(req);
        expect(res.data?.id).toBe("1");
        expect(res.data?.user).toBe("u1");
      });
    });

    describe("updatePassword", () => {
      test("should fail if request data is missing", async () => {
        const req = new RequestModel<PasswordUpdate>("tx-1", undefined);
        const res = await useCases.updatePassword(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should fail if required fields are missing", async () => {
        const update = PasswordUpdate.builder().setId("1").setCurrentPassword("").build();
        const req = new RequestModel<PasswordUpdate>("tx-1", update);
        const res = await useCases.updatePassword(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should fail if new password does not match confirmation", async () => {
        const update = PasswordUpdate.builder()
          .setId("1")
          .setCurrentPassword("OldPassword123!")
          .setNewPassword("New12345!")
          .setPasswordConfirmation("Different!")
          .build();
        const req = new RequestModel<PasswordUpdate>("tx-1", update);
        const res = await useCases.updatePassword(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should fail if new password fails regexp check", async () => {
        const update = PasswordUpdate.builder()
          .setId("1")
          .setCurrentPassword("OldPassword123!")
          .setNewPassword("simple")
          .setPasswordConfirmation("simple")
          .build();
        const req = new RequestModel<PasswordUpdate>("tx-1", update);
        const res = await useCases.updatePassword(req);
        expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      });

      test("should update successfully with valid input", async () => {
        const update = PasswordUpdate.builder()
          .setId("1")
          .setCurrentPassword("OldPassword123!")
          .setNewPassword("NewPassword123!")
          .setPasswordConfirmation("NewPassword123!")
          .build();
        const mockResponse = new ResponseModel<void>("tx-1");
        mockUserRepository.updateUserPassword.mockResolvedValue(mockResponse);

        const req = new RequestModel<PasswordUpdate>("tx-1", update);
        const res = await useCases.updatePassword(req);
        expect(res.errorCode).toBeUndefined();
      });
    });

    test("should update personal information", async () => {
      const update = PersonalInformationUpdate.builder()
        .setUserId("1")
        .setCountryCode("FR")
        .build();
      const mockResponse = new ResponseModel<void>("tx-1");
      mockUserRepository.updatePersonalInformation.mockResolvedValue(mockResponse);

      const req = new RequestModel<PersonalInformationUpdate>("tx-1", update);
      const res = await useCases.updatePersonalInformation(req);
      expect(res.errorCode).toBeUndefined();
    });

    describe("getGuestData", () => {
      test("should return Guest user details successfully", async () => {
        const mockExistsResponse1 = new ResponseModel<boolean>("tx-1").withResponse(true);
        const mockExistsResponse2 = new ResponseModel<boolean>("tx-1").withResponse(false);
        mockUserRepository.userExists
          .mockResolvedValueOnce(mockExistsResponse1)
          .mockResolvedValueOnce(mockExistsResponse2);

        const mockPermission = new Permission(1, "read");
        const mockRole = new Role(1, "Guest", [mockPermission]);
        mockRoleRepository.queryGuestRole.mockResolvedValue(
          new ResponseModel<Role>("tx-1").withResponse(mockRole),
        );

        const req = new RequestModel<string>("tx-1", "existing-guest");
        const res = await useCases.getGuestData(req);

        expect(res.data?.name).toBe("Guest");
        expect(res.data?.roles).toContain("Guest");
        expect(res.data?.permissions).toContain("read");
      });

      test("should return error if userExists fails", async () => {
        const mockExistsResponse = new ResponseModel<boolean>("tx-1").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "DB crashed",
        );
        mockUserRepository.userExists.mockResolvedValue(mockExistsResponse);

        const req = new RequestModel<string>("tx-1", "some-guest");
        const res = await useCases.getGuestData(req);

        expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      });
    });
  });
});
