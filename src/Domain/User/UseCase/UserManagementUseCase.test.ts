import { mock, MockProxy } from "jest-mock-extended";
import { UserManagementUseCase } from "./UserManagementUseCase";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { PasswordUpdate } from "@src/Domain/User/Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "@src/Domain/User/Entity/PersonalInformationUpdate";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

describe("UserManagementUseCase", () => {
  let useCase: UserManagementUseCase;
  let mockUserRepository: MockProxy<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    useCase = new UserManagementUseCase(mockUserRepository);
  });

  describe("enable", () => {
    it("should enable user successfully", async () => {
      mockUserRepository.enableUser.mockResolvedValue(new ResponseModel<void>("tx-1"));
      const req = new RequestModel("tx-1", "user-123");
      const res = await useCase.enable(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.enableUser).toHaveBeenCalledWith(req);
    });
  });

  describe("disable", () => {
    it("should disable user successfully", async () => {
      mockUserRepository.disableUser.mockResolvedValue(new ResponseModel<void>("tx-1"));
      const req = new RequestModel("tx-1", "user-123");
      const res = await useCase.disable(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.disableUser).toHaveBeenCalledWith(req);
    });
  });

  describe("delete", () => {
    it("should delete user successfully", async () => {
      mockUserRepository.deleteUser.mockResolvedValue(new ResponseModel<void>("tx-1"));
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
      expect(mockUserRepository.updatePersonalInformation).toHaveBeenCalledWith(req);
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
      mockUserRepository.updateUserPassword.mockResolvedValue(new ResponseModel<void>("tx-1"));

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockUserRepository.updateUserPassword).toHaveBeenCalledWith(req);
    });

    it("should fail to update password if missing fields", async () => {
      const mockUpdate = new PasswordUpdate("user-123", "", "NewPass123!", "NewPass123!");

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
      expect(res.message).toBe("New password and password confirmation do not match.");
    });

    it("should fail to update password if new password is too simple", async () => {
      const mockUpdate = new PasswordUpdate("user-123", "OldPass123!", "simple", "simple");

      const req = new RequestModel<PasswordUpdate>("tx-1", mockUpdate);
      const res = await useCase.updatePassword(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });
  });
});
