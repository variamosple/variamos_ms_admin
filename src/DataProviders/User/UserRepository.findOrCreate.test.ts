import { mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
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
describe("Google sign-in (findOrCreate)", () => {
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => 4 }),
  );
  const useCase = new UserAuthUseCase(
    repository,
    { queryGuestRole: vi.fn() },
    mock<ILogger>(),
    { sendExistingAccountMail: vi.fn() },
    { adminHomeUri: "" },
    mock<AccountPasswordService>(),
  );
  const googleUser = new RequestModel<User>("loginWithGoogle", {
    email: "someone@example.com",
    user: "someone",
    name: "Someone",
  } as User);
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
    stored(flags);
    const update = vi.spyOn(UserModel, "update");

    const response = await useCase.findOrCreate(googleUser);

    expect(response.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
    expect(response.message).toBe(message);
    expect(update).not.toHaveBeenCalled();
  });

  it("records the sign-in of an open account", async () => {
    stored({ isEnabled: true, isDeleted: false });
    const update = vi
      .spyOn(UserModel, "update")
      .mockResolvedValue([1] as never);
    // Roles and permissions of the signed in user
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);

    const response = await useCase.findOrCreate(googleUser);

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.id).toBe("u1");
    expect(update).toHaveBeenCalledWith(
      { lastLogin: expect.any(Date) },
      { where: { id: "u1" } },
    );
  });
});
