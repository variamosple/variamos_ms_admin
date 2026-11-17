import type { Mock } from "vitest";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { ISessionRevoker } from "#src/Domain/Session/Repository/ISessionRepository.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import type { IUserPasswordRepository } from "#src/Domain/User/IUserPasswordRepository.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import type { IUserSignInRepository } from "#src/Domain/User/IUserSignInRepository.js";
import { UserManagementUseCase } from "./UserManagementUseCase.js";

// The activity journal is checked by its own tests (T-24)
const activityJournal = { record: vi.fn().mockResolvedValue(undefined) };

describe("UserManagementUseCase", () => {
  let useCase: UserManagementUseCase;
  let logger: MockProxy<ILogger>;
  let mockUserRepository: MockProxy<
    IUserRepository & IUserSignInRepository & IUserPasswordRepository
  >;

  beforeEach(() => {
    logger = mock<ILogger>();
    mockUserRepository = mock<
      IUserRepository & IUserSignInRepository & IUserPasswordRepository
    >();
    useCase = new UserManagementUseCase(
      { accounts: mockUserRepository, passwords: mockUserRepository },
      activityJournal,
      logger,
    );
  });

  describe("enable", () => {
    it("should enable user successfully", async () => {
      mockUserRepository.enableUser.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );
      const req = new RequestModel("tx-1", "user-123");
      const res = await useCase.enable(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.enableUser).toHaveBeenCalledWith(req);
    });
  });

  describe("disable", () => {
    it("should disable user successfully", async () => {
      mockUserRepository.disableUser.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );
      const req = new RequestModel("tx-1", "user-123");
      const res = await useCase.disable(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.disableUser).toHaveBeenCalledWith(req);
    });
  });

  describe("delete", () => {
    it("should delete user successfully", async () => {
      mockUserRepository.deleteUser.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );
      const req = new RequestModel("tx-1", "user-123");
      const res = await useCase.delete(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.deleteUser).toHaveBeenCalledWith(req);
    });
  });

  describe("updateProfile", () => {
    it("should update personal info successfully", async () => {
      const updateData = new PersonalInformationUpdate("user-123", "FR");
      mockUserRepository.updatePersonalInformation.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );

      const req = new RequestModel("tx-1", updateData);
      const res = await useCase.updateProfile(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.updatePersonalInformation).toHaveBeenCalledWith(
        req,
      );
    });
  });

  describe("updatePassword", () => {
    it("should update password successfully when inputs are valid", async () => {
      const mockUpdate = new PasswordUpdate(
        "user-123",
        "OldPass123!",
        "NewPass123!",
        "NewPass123!",
      );
      mockUserRepository.updateUserPassword.mockResolvedValue(
        new ResponseModel<void>("tx-1"),
      );

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.updateUserPassword).toHaveBeenCalledWith(req);
    });

    it("should fail to update password if missing fields", async () => {
      const mockUpdate = new PasswordUpdate(
        "user-123",
        "",
        "NewPass123!",
        "NewPass123!",
      );

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(mockUserRepository.updateUserPassword).not.toHaveBeenCalled();
    });

    it("should fail to update password if confirmation doesn't match", async () => {
      const mockUpdate = new PasswordUpdate(
        "user-123",
        "OldPass123!",
        "NewPass123!",
        "DifferentPass123!",
      );

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe(
        "New password and password confirmation do not match.",
      );
    });

    it("should fail to update password if new password is too simple", async () => {
      const mockUpdate = new PasswordUpdate(
        "user-123",
        "OldPass123!",
        "simple",
        "simple",
      );

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });
  });

  // EV-74 lot 2: a closed account or a changed password ends its sessions
  describe("sessions of the account", () => {
    let sessions: { revokeAllOf: Mock<ISessionRevoker["revokeAllOf"]> };
    let withSessions: UserManagementUseCase;
    const ok = () => new ResponseModel<void>("tx-1");
    const refused = () =>
      new ResponseModel<void>("tx-1").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "No such account",
      );

    beforeEach(() => {
      sessions = {
        revokeAllOf: vi
          .fn<ISessionRevoker["revokeAllOf"]>()
          .mockResolvedValue(1),
      };
      withSessions = new UserManagementUseCase(
        { accounts: mockUserRepository, passwords: mockUserRepository },
        activityJournal,
        logger,
        { sessions },
      );
    });

    it("ends them when the account is disabled or deleted", async () => {
      mockUserRepository.disableUser.mockResolvedValue(ok());
      mockUserRepository.deleteUser.mockResolvedValue(ok());

      await withSessions.disable(new RequestModel("tx-1", "user-1"));
      await withSessions.delete(new RequestModel("tx-1", "user-2"));

      expect(sessions.revokeAllOf.mock.calls).toEqual([["user-1"], ["user-2"]]);
    });

    it("leaves them when the change is refused, or the account enabled", async () => {
      mockUserRepository.disableUser.mockResolvedValue(refused());
      mockUserRepository.deleteUser.mockResolvedValue(refused());
      mockUserRepository.enableUser.mockResolvedValue(ok());

      await withSessions.disable(new RequestModel("tx-1", "user-1"));
      await withSessions.delete(new RequestModel("tx-1", "user-1"));
      await withSessions.enable(new RequestModel("tx-1", "user-1"));
      await withSessions.disable(new RequestModel<string>("tx-1"));

      expect(sessions.revokeAllOf).not.toHaveBeenCalled();
    });

    it("ends them when the password changes, and not when it is refused", async () => {
      const update = new RequestModel(
        "tx-1",
        new PasswordUpdate(
          "user-1",
          "OldPass123!",
          "NewPass123!",
          "NewPass123!",
        ),
      );
      mockUserRepository.updateUserPassword
        .mockResolvedValueOnce(refused())
        .mockResolvedValueOnce(ok());

      expect(
        (await withSessions.updatePassword(update)).errorCode,
      ).toBeDefined();
      expect(sessions.revokeAllOf).not.toHaveBeenCalled();
      expect(
        (await withSessions.updatePassword(update)).errorCode,
      ).toBeUndefined();
      expect(sessions.revokeAllOf).toHaveBeenCalledWith("user-1");
    });

    it("keeps the change when the sessions cannot be ended, and logs it", async () => {
      sessions.revokeAllOf.mockRejectedValue(new Error("database down"));
      mockUserRepository.disableUser.mockResolvedValue(ok());

      const res = await withSessions.disable(
        new RequestModel("tx-1", "user-1"),
      );

      expect(res.errorCode).toBeUndefined();
      expect(logger.err).toHaveBeenCalledWith(
        expect.stringContaining("could not be ended"),
      );
    });
  });
});
