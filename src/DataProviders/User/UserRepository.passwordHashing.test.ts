import bcrypt from "bcrypt";
import type { Transaction } from "sequelize";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

/**
 * Every new password takes the configured cost (T-18 lot 2). Sign-up and the
 * password change used a fixed cost of 10, whatever the configuration.
 */
describe("UserRepositoryImpl hashes new passwords with the configured cost", () => {
  const CONFIGURED_COST = 5;
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => CONFIGURED_COST }),
  );
  const costOf = (hash: unknown) => Number(String(hash).split("$")[2]);
  const storedPassword = (values: unknown) =>
    String((values as { password?: string } | undefined)?.password);
  const transaction = {
    commit: vi.fn(),
    rollback: vi.fn(),
    LOCK: { UPDATE: "UPDATE" },
  } as unknown as Transaction;

  beforeEach(() => {
    vi.spyOn(VARIAMOS_ORM, "transaction").mockImplementation(((
      work?: (t: Transaction) => Promise<unknown>,
    ) => (work ? work(transaction) : Promise.resolve(transaction))) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const storedAccount = async () =>
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      password: await bcrypt.hash("Old-password-1", 4),
      isEnabled: true,
      isDeleted: false,
    } as unknown as UserModel);

  it("at sign-up", async () => {
    vi.spyOn(UserModel, "findOne").mockResolvedValue(null);
    const create = vi.spyOn(UserModel, "create").mockResolvedValue({
      id: "u2",
      user: "Jane",
      name: "Jane",
      email: "jane@example.com",
    } as unknown as UserModel);

    const response = await repository.signUp(
      new RequestModel("signUp", {
        email: "jane@example.com",
        password: "New-password-1",
        name: "Jane",
      } as UserRegistration),
    );

    expect(response.errorCode).toBeUndefined();
    const stored = storedPassword(create.mock.calls[0]?.[0]);
    expect(costOf(stored)).toBe(CONFIGURED_COST);
    expect(await bcrypt.compare("New-password-1", stored)).toBe(true);
  });

  it("at a password change", async () => {
    await storedAccount();
    const update = vi.spyOn(UserModel, "update").mockResolvedValue([1]);
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([[], 0] as never);

    const response = await repository.updateUserPassword(
      new RequestModel(
        "passwordUpdate",
        PasswordUpdate.builder()
          .setId("u1")
          .setCurrentPassword("Old-password-1")
          .setNewPassword("New-password-1")
          .setPasswordConfirmation("New-password-1")
          .build(),
      ),
    );

    expect(response.errorCode).toBeUndefined();
    const stored = storedPassword(update.mock.calls[0]?.[0]);
    expect(costOf(stored)).toBe(CONFIGURED_COST);
  });

  it("refuses a wrong current password, as before", async () => {
    await storedAccount();
    const update = vi.spyOn(UserModel, "update");

    const response = await repository.updateUserPassword(
      new RequestModel(
        "passwordUpdate",
        PasswordUpdate.builder()
          .setId("u1")
          .setCurrentPassword("Wrong-password-1")
          .setNewPassword("New-password-1")
          .setPasswordConfirmation("New-password-1")
          .build(),
      ),
    );

    expect(response.message).toBe("Current password is incorrect.");
    expect(update).not.toHaveBeenCalled();
  });

  it("at a reset with a link", async () => {
    await storedAccount();
    const update = vi.spyOn(UserModel, "update").mockResolvedValue([1]);
    vi.spyOn(VARIAMOS_ORM, "query").mockImplementation((async (sql: string) =>
      String(sql).includes("password_reset_tokens")
        ? [{ userId: "u1" }]
        : [[], 0]) as never);

    const outcome = await repository.resetPasswordWithToken(
      "token-hash",
      "New-password-1",
    );

    expect(outcome).toBe("reset");
    const stored = storedPassword(update.mock.calls[0]?.[0]);
    expect(costOf(stored)).toBe(CONFIGURED_COST);
  });

  it("refuses the current password at a reset, as before", async () => {
    await storedAccount();
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([
      { userId: "u1" },
    ] as never);

    expect(
      await repository.resetPasswordWithToken("token-hash", "Old-password-1"),
    ).toBe("same_password");
  });
});
