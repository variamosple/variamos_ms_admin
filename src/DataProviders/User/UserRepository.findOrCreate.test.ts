import { mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { GoogleProfile } from "#src/Domain/User/Entity/GoogleIdentity.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { AccountPasswordService } from "#src/Domain/User/Service/AccountPasswordService.js";
import { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

vi.mock("#src/common/logger.js");

// The Google sign-in as it runs: the repository reads or creates the
// account, the use case decides (EV-98)
describe("Google sign-in (signInWithGoogle)", () => {
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => 4 }),
  );
  const useCase = new UserAuthUseCase({
    userRepository: repository,
    roleRepository: { queryGuestRole: vi.fn() },
    logger: mock<ILogger>(),
    mailService: { sendExistingAccountMail: vi.fn() },
    config: { adminHomeUri: "" },
    accountPasswords: mock<AccountPasswordService>(),
  });
  const googleUser = new RequestModel<User>("loginWithGoogle", {
    email: "someone@example.com",
    user: "someone",
    name: "Someone",
  } as User);
  const googleProfile = new RequestModel<GoogleProfile>("loginWithGoogle", {
    sub: "google-sub-1",
    email: "someone@example.com",
    name: "Someone",
    emailVerified: true,
  });
  // No account linked to the Google account, none with this address yet
  const unknownEverywhere = () => {
    vi.spyOn(UserModel, "findOne").mockResolvedValue(null);
    return vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);
  };
  const stored = (flags: { isEnabled: boolean; isDeleted: boolean }) =>
    vi.spyOn(UserModel, "findOrCreate").mockResolvedValue([
      {
        id: "u1",
        user: "someone",
        name: "Someone",
        email: "someone@example.com",
        ...flags,
      } as unknown as UserModel,
      false,
    ]);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the account with its state, without deciding", async () => {
    stored({ isEnabled: false, isDeleted: true });
    const update = vi.spyOn(UserModel, "update");

    const response = await repository.findOrCreateUser(googleUser);

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toMatchObject({
      id: "u1",
      email: "someone@example.com",
      isEnabled: false,
      isDeleted: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  // FORBIDDEN lets the Google callback send its own reason to the login page
  it.each([
    [
      "disabled",
      { isEnabled: false, isDeleted: false },
      "Your account is disabled.",
    ],
    [
      "deleted",
      { isEnabled: true, isDeleted: true },
      "Your account is deleted.",
    ],
  ])("refuses a %s account as forbidden", async (_label, flags, message) => {
    unknownEverywhere();
    stored(flags);
    const update = vi.spyOn(UserModel, "update");

    const response = await useCase.signInWithGoogle(googleProfile);

    expect(response.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
    expect(response.message).toBe(message);
    expect(update).not.toHaveBeenCalled();
  });

  it("links and records the sign-in of an open account", async () => {
    // Also answers the roles and permissions of the signed in user
    const query = unknownEverywhere();
    stored({ isEnabled: true, isDeleted: false });
    const update = vi
      .spyOn(UserModel, "update")
      .mockResolvedValue([1] as never);

    const response = await useCase.signInWithGoogle(googleProfile);

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.id).toBe("u1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"user_google_identity" ("google_sub", "user_id")',
      ),
      { replacements: { googleSub: "google-sub-1", userId: "u1" } },
    );
    expect(update).toHaveBeenCalledWith(
      { lastLogin: expect.any(Date) },
      { where: { id: "u1" } },
    );
  });
});
