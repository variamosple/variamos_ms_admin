import bcrypt from "bcrypt";
import type { Transaction } from "sequelize";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

/** A new password asks the sign-in code again on every browser (lot 6). */
describe("UserRepositoryImpl forgets the trusted browsers", () => {
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => 4 }),
  );
  const transaction = {
    commit: vi.fn(),
    rollback: vi.fn(),
    LOCK: { UPDATE: "UPDATE" },
  } as unknown as Transaction;
  let query: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const hash = await bcrypt.hash("Old-password-1", 4);
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      password: hash,
      isEnabled: true,
      isDeleted: false,
    } as unknown as UserModel);
    vi.spyOn(UserModel, "update").mockResolvedValue([1]);
    vi.spyOn(VARIAMOS_ORM, "transaction").mockImplementation(((
      work?: (t: Transaction) => Promise<unknown>,
    ) => (work ? work(transaction) : Promise.resolve(transaction))) as never);
    query = vi.spyOn(VARIAMOS_ORM, "query");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const forgetCalls = () =>
    (query.mock.calls as [string, object][]).filter(([sql]) =>
      String(sql).includes("user_mfa_trusted_device"),
    );

  it("when the user changes the password", async () => {
    query.mockResolvedValue([[], 0] as never);
    const update = PasswordUpdate.builder()
      .setId("u1")
      .setCurrentPassword("Old-password-1")
      .setNewPassword("New-password-1")
      .setPasswordConfirmation("New-password-1")
      .build();

    const response = await repository.updateUserPassword(
      new RequestModel("passwordUpdate", update),
    );

    expect(response.errorCode).toBeUndefined();
    expect(forgetCalls()).toHaveLength(1);
    expect(forgetCalls()[0]?.[1]).toMatchObject({
      replacements: { userId: "u1" },
      transaction,
    });
  });

  it("when the password is reset with a link", async () => {
    query.mockImplementation((async (sql: string) =>
      String(sql).includes("password_reset_tokens")
        ? [{ userId: "u1" }]
        : [[], 0]) as never);

    const outcome = await repository.resetPasswordWithToken(
      "token-hash",
      "New-password-1",
    );

    expect(outcome).toBe("reset");
    expect(forgetCalls()).toHaveLength(1);
    expect(forgetCalls()[0]?.[1]).toMatchObject({
      replacements: { userId: "u1" },
      transaction,
    });
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("not when the current password is wrong", async () => {
    const update = PasswordUpdate.builder()
      .setId("u1")
      .setCurrentPassword("Wrong-password-1")
      .setNewPassword("New-password-1")
      .setPasswordConfirmation("New-password-1")
      .build();

    await repository.updateUserPassword(
      new RequestModel("passwordUpdate", update),
    );

    expect(forgetCalls()).toHaveLength(0);
  });
});
