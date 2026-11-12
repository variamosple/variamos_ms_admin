import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { IGuestRoleRepository } from "#src/Domain/Role/Repository/IGuestRoleRepository.js";
import { PasswordPolicy } from "#src/Domain/User/Entity/PasswordPolicy.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { IUserPasswordRepository } from "#src/Domain/User/IUserPasswordRepository.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import type { IUserSignInRepository } from "#src/Domain/User/IUserSignInRepository.js";
import type { AccountPasswordService } from "#src/Domain/User/Service/AccountPasswordService.js";
import type { IPasswordPolicyProvider } from "#src/Domain/User/Service/PasswordPolicyService.js";
import { PasswordResetTokenService } from "#src/Domain/User/Service/PasswordResetTokenService.js";
import { UserAuthUseCase } from "./UserAuthUseCase.js";
import { UserManagementUseCase } from "./UserManagementUseCase.js";
import { UserPasswordUseCase } from "./UserPasswordUseCase.js";

// The activity journal is checked by its own tests (T-24)
const activityJournal = { record: vi.fn().mockResolvedValue(undefined) };

/** A configured policy stricter than the default: 12 characters. */
const strict: IPasswordPolicyProvider = {
  getPolicy: async () => PasswordPolicy.fromConfiguration({ minLength: 12 }),
  getResetExpiryMs: async () => 30 * 60 * 1000,
};
const ACCEPTED_BY_DEFAULT = "Short1!aa"; // 9 characters
const STRICT_MESSAGE = "Password must be between 12 and 64";

describe("configured password policy in the use cases", () => {
  let users: MockProxy<
    IUserRepository & IUserSignInRepository & IUserPasswordRepository
  >;

  beforeEach(() => {
    users = mock<
      IUserRepository & IUserSignInRepository & IUserPasswordRepository
    >();
  });
  afterEach(() => vi.restoreAllMocks());

  it("sign-up refuses a password below the configured length", async () => {
    const useCase = new UserAuthUseCase({
      userRepository: users,
      roleRepository: mock<IGuestRoleRepository>(),
      logger: mock<ILogger>(),
      mailService: mock<IMailService>(),
      config: { adminHomeUri: "https://app.example.com" },
      accountPasswords: mock<AccountPasswordService>(),
      passwordPolicy: strict,
    });

    const res = await useCase.signUp(
      new RequestModel<UserRegistration>("signUp", {
        name: "Ana",
        email: "ana@example.com",
        password: ACCEPTED_BY_DEFAULT,
        passwordConfirmation: ACCEPTED_BY_DEFAULT,
      } as UserRegistration),
    );

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(res.message).toContain(STRICT_MESSAGE);
    expect(users.signUp).not.toHaveBeenCalled();
  });

  it("password change refuses it too", async () => {
    const useCase = new UserManagementUseCase(
      { accounts: users, passwords: users },
      activityJournal,
      mock<ILogger>(),
      strict,
    );

    const res = await useCase.updatePassword(
      new RequestModel(
        "updatePassword",
        new PasswordUpdate(
          "u1",
          "Current1!pass",
          ACCEPTED_BY_DEFAULT,
          ACCEPTED_BY_DEFAULT,
        ),
      ),
    );

    expect(res.message).toContain(STRICT_MESSAGE);
    expect(users.updateUserPassword).not.toHaveBeenCalled();
  });

  it("password reset refuses it too, before touching the token", async () => {
    const useCase = new UserPasswordUseCase({
      repositories: { accounts: users, passwords: users },
      mailService: mock<IMailService>(),
      config: { passwordResetExpiryInMs: 3_600_000, adminHomeUri: "http://ui" },
      journal: activityJournal,
      logger: mock<ILogger>(),
      passwordPolicy: strict,
    });

    const res = await useCase.resetPassword(
      new RequestModel("resetPassword", {
        token: "t",
        password: ACCEPTED_BY_DEFAULT,
      }),
    );

    expect(res.message).toContain(STRICT_MESSAGE);
    expect(users.getPasswordResetToken).not.toHaveBeenCalled();
  });

  it("the reset link uses the configured validity", async () => {
    const mail = mock<IMailService>();
    mail.sendPasswordResetMail.mockResolvedValue(true);
    users.getUserByEmail.mockResolvedValue({ id: "u1" } as never);
    const createToken = vi
      .spyOn(PasswordResetTokenService.prototype, "createResetToken")
      .mockResolvedValue("token");
    const useCase = new UserPasswordUseCase({
      repositories: { accounts: users, passwords: users },
      mailService: mail,
      config: { passwordResetExpiryInMs: 3_600_000, adminHomeUri: "http://ui" },
      journal: activityJournal,
      logger: mock<ILogger>(),
      passwordPolicy: strict,
    });

    await useCase.requestReset(new RequestModel("forgot", "ana@example.com"));
    await vi.waitFor(() =>
      expect(mail.sendPasswordResetMail).toHaveBeenCalled(),
    );

    expect(createToken).toHaveBeenCalledWith(
      expect.anything(),
      30 * 60 * 1000,
      "PASSWORD RESET ATTEMPT",
    );
  });

  it("exposes the policy for the UI forms", async () => {
    const useCase = new UserPasswordUseCase({
      repositories: { accounts: users, passwords: users },
      mailService: mock<IMailService>(),
      config: { passwordResetExpiryInMs: 3_600_000, adminHomeUri: "http://ui" },
      journal: activityJournal,
      logger: mock<ILogger>(),
      passwordPolicy: strict,
    });

    const res = await useCase.getPasswordPolicy();

    expect(res).toBeInstanceOf(ResponseModel);
    expect(res.data).toMatchObject({ minLength: 12, maxLength: 64 });
  });
});
