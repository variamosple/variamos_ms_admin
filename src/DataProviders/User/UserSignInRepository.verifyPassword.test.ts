import bcrypt from "bcrypt";
import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { AccountPasswordService } from "#src/Domain/User/Service/AccountPasswordService.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import { UserModel } from "./User.js";
import { UserSignInRepositoryImpl } from "./UserSignInRepository.js";

// The password asked again before a second factor changes (EV-98: the rule
// is decided by the domain service, on what the repository reads)
describe("AccountPasswordService.verifyPassword", () => {
  const hasher = new BcryptPasswordHasher({ getCost: async () => 4 });
  const repository = new AccountPasswordService(
    new UserSignInRepositoryImpl(hasher),
    hasher,
    mock<ILogger>(),
  );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the password of an active account", async () => {
    const hash = await bcrypt.hash("Right-pass-1", 4);
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      password: hash,
      isEnabled: true,
      isDeleted: false,
    } as unknown as UserModel);

    expect(await repository.verifyPassword("u1", "Right-pass-1")).toBe(true);
    expect(await repository.verifyPassword("u1", "Wrong-pass-1")).toBe(false);
  });

  it.each([
    ["an unknown account", null],
    ["a disabled account", { isEnabled: false, isDeleted: false }],
    ["a deleted account", { isEnabled: true, isDeleted: true }],
  ])("refuses %s, after comparing a hash", async (_label, state) => {
    const hash = await bcrypt.hash("Right-pass-1", 4);
    vi.spyOn(UserModel, "findOne").mockResolvedValue(
      (state
        ? { id: "u1", password: hash, ...state }
        : null) as unknown as UserModel,
    );
    const compare = vi.spyOn(bcrypt, "compare");

    expect(await repository.verifyPassword("u1", "Right-pass-1")).toBe(false);
    expect(compare).toHaveBeenCalledTimes(1);
  });
});
