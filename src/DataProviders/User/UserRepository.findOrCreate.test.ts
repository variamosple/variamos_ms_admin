import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

describe("UserRepositoryImpl.findOrCreateUser (Google sign-in)", () => {
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => 4 }),
  );
  const findOrCreate = () =>
    repository.findOrCreateUser(
      new RequestModel<User>("loginWithGoogle", {
        email: "someone@example.com",
        user: "someone",
        name: "Someone",
      } as User),
    );

  afterEach(() => {
    vi.restoreAllMocks();
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
    vi.spyOn(UserModel, "findOrCreate").mockResolvedValue([
      { id: "u1", ...flags } as unknown as UserModel,
      false,
    ]);

    const response = await findOrCreate();

    expect(response.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
    expect(response.message).toBe(message);
  });
});
