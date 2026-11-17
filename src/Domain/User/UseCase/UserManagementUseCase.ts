import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  type ISessionRevoker,
  NO_SESSION_REVOKER,
} from "#src/Domain/Session/Repository/ISessionRepository.js";
import type { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import {
  checkNewPassword,
  DEFAULT_PASSWORD_POLICY_PROVIDER,
  type IPasswordPolicyProvider,
} from "#src/Domain/User/Service/PasswordPolicyService.js";
import type { UserRepositories } from "#src/Domain/User/UserRepositories.js";

/** What the account changes check and end; each has a default. */
export interface UserManagementOptions {
  passwordPolicy?: IPasswordPolicyProvider;
  /** Ends the sessions of an account closed or whose password changed. */
  sessions?: ISessionRevoker;
}

export class UserManagementUseCase {
  private readonly passwordPolicy: IPasswordPolicyProvider;
  private readonly sessions: ISessionRevoker;

  public constructor(
    private readonly repositories: Pick<
      UserRepositories,
      "accounts" | "passwords"
    >,
    private readonly journal: IActivityJournal,
    private readonly logger: ILogger,
    {
      passwordPolicy = DEFAULT_PASSWORD_POLICY_PROVIDER,
      sessions = NO_SESSION_REVOKER,
    }: UserManagementOptions = {},
  ) {
    this.passwordPolicy = passwordPolicy;
    this.sessions = sessions;
  }

  /**
   * Ends every session of the account (EV-74 lot 2). The change itself is
   * done: a failure here is logged, not reported as a failed change.
   */
  private async endSessionsOf(userId: string | undefined): Promise<void> {
    if (!userId) return;
    try {
      await this.sessions.revokeAllOf(userId);
    } catch (error) {
      this.logger.err(
        `The sessions of an account could not be ended: ${errorMessage(error)}`,
      );
    }
  }

  public async enable(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.userActivity(request, "user.enable", { isEnabled: true }),
      () => this.repositories.accounts.enableUser(request),
    );
  }

  public async disable(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.userActivity(request, "user.disable", { isEnabled: false }),
      () => this.repositories.accounts.disableUser(request),
    ).then(async (response) => {
      if (!response.errorCode) await this.endSessionsOf(request.data);
      return response;
    });
  }

  public async delete(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return await withJournal(
      this.journal,
      this.userActivity(request, "user.delete", { isDeleted: true }),
      () => this.repositories.accounts.deleteUser(request),
    ).then(async (response) => {
      if (!response.errorCode) await this.endSessionsOf(request.data);
      return response;
    });
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
    return await this.repositories.accounts.updatePersonalInformation(request);
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
      this.logger,
      newPassword,
      "Password change",
    );
    if (refusal) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    const updated =
      await this.repositories.passwords.updateUserPassword(request);
    if (!updated.errorCode) await this.endSessionsOf(data.getId());
    return updated;
  }
}
