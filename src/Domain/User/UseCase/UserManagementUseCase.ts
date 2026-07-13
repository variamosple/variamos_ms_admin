import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { PasswordUpdate } from "@src/Domain/User/Entity/PasswordUpdate";
import { Password } from "@src/Domain/User/Entity/Password";
import { PersonalInformationUpdate } from "@src/Domain/User/Entity/PersonalInformationUpdate";

export class UserManagementUseCase {
  public constructor(private readonly userRepository: IUserRepository) {}

  public async enable(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.enableUser(request);
  }

  public async disable(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.disableUser(request);
  }

  public async delete(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userRepository.deleteUser(request);
  }

  public async updateProfile(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    return this.userRepository.updatePersonalInformation(request);
  }

  public async updatePassword(request: RequestModel<PasswordUpdate>): Promise<ResponseModel<void>> {
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

    try {
      new Password(newPassword);
    } catch (error) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, (error as Error).message);
    }

    return this.userRepository.updateUserPassword(request);
  }
}
