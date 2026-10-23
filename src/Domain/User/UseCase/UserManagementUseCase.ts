import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import {
  checkNewPassword,
  DEFAULT_PASSWORD_POLICY_PROVIDER,
  type IPasswordPolicyProvider,
} from "#src/Domain/User/Service/PasswordPolicyService.js";

export class UserManagementUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly journal: IActivityJournal,
    private readonly passwordPolicy: IPasswordPolicyProvider = DEFAULT_PASSWORD_POLICY_PROVIDER,
  ) {}

  public async enable(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return withJournal(
      this.journal,
      this.userActivity(request, "user.enable", { isEnabled: true }),
      () => this.userRepository.enableUser(request),
    );
  }

  public async disable(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return withJournal(
      this.journal,
      this.userActivity(request, "user.disable", { isEnabled: false }),
      () => this.userRepository.disableUser(request),
    );
  }

  public async delete(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return withJournal(
      this.journal,
      this.userActivity(request, "user.delete", { isDeleted: true }),
      () => this.userRepository.deleteUser(request),
    );
  }

  private userActivity(
    request: RequestModel<string>,
    action: string,
    after: Record<string, boolean>,
  ) {
    return {
      actorId: request.actorId,
      action,
      entityType: "user",
      entityId: request.data,
      after,
      transactionId: request.transactionId,
    };
  }

  public async updateProfile(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    return this.userRepository.updatePersonalInformation(request);
  }

  public async updatePassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>> {
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

    const refusal = await checkNewPassword(
      this.passwordPolicy,
      newPassword,
      "Password change",
    );
    if (refusal) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    return this.userRepository.updateUserPassword(request);
  }
}
