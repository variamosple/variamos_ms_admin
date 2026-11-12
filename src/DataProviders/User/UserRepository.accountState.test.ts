import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserPasswordRepositoryImpl } from "./UserPasswordRepository.js";
import { UserRepositoryImpl } from "./UserRepository.js";
import { UserSignInRepositoryImpl } from "./UserSignInRepository.js";

vi.mock("#src/common/logger.js");

// The repository reads the state of an account; the domain says whether it
// is open (EV-98)
describe("UserRepositoryImpl account state", () => {
  const hasher = new BcryptPasswordHasher({ getCost: async () => 4 });
  const repositories = {
    accounts: new UserRepositoryImpl(),
    signIn: new UserSignInRepositoryImpl(hasher),
    passwords: new UserPasswordRepositoryImpl(hasher),
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPasswordResetToken", () => {
    const tokenRow = (state: {
      isEnabled: boolean | null;
      isDeleted: boolean | null;
    }) => ({
      userId: "u1",
      expiresAt: new Date("2026-11-03T00:00:00Z"),
      usedAt: null,
      ...state,
    });

    it.each([
      ["an open account", { isEnabled: true, isDeleted: false }, true],
      ["a disabled account", { isEnabled: false, isDeleted: false }, false],
      ["a deleted account", { isEnabled: true, isDeleted: true }, false],
      // The LEFT JOIN finds no account
      ["a missing account", { isEnabled: null, isDeleted: null }, false],
    ])("says whether the token opens %s", async (_, state, active) => {
      vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([
        tokenRow(state),
      ] as never);

      expect(
        await repositories.passwords.getPasswordResetToken("hash"),
      ).toEqual({
        userId: "u1",
        expiresAt: new Date("2026-11-03T00:00:00Z"),
        usedAt: null,
        isUserActive: active,
      });
    });

    it("gives null for an unknown token", async () => {
      vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);

      expect(
        await repositories.passwords.getPasswordResetToken("hash"),
      ).toBeNull();
    });
  });

  describe("resetPasswordWithToken", () => {
    // The token is consumed, then the account is read under lock: one
    // closed meanwhile keeps its password
    it.each([
      ["disabled", false, false],
      ["deleted", true, true],
    ])("leaves a %s account unchanged", async (_, isEnabled, isDeleted) => {
      const transaction = {
        LOCK: { UPDATE: "UPDATE" },
        commit: vi.fn(),
        rollback: vi.fn(),
      };
      vi.spyOn(VARIAMOS_ORM, "transaction").mockResolvedValue(
        transaction as never,
      );
      vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([
        { userId: "u1" },
      ] as never);
      vi.spyOn(UserModel, "findOne").mockResolvedValue({
        id: "u1",
        password: "$2b$04$hash",
        isEnabled,
        isDeleted,
      } as unknown as UserModel);
      const update = vi.spyOn(UserModel, "update");

      expect(
        await repositories.passwords.resetPasswordWithToken(
          "hash",
          "New-pass-1!",
        ),
      ).toBe("inactive_account");
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("findSessionUser", () => {
    it("reads a closed account with its state, without refusing it", async () => {
      vi.spyOn(UserModel, "findOne").mockResolvedValue({
        id: "u1",
        user: "someone",
        name: "Someone",
        email: "someone@example.com",
        isEnabled: false,
        isDeleted: true,
      } as unknown as UserModel);
      // Roles and permissions
      vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);

      const response = await repositories.accounts.findSessionUser(
        new RequestModel<string>("tx-1", "u1"),
      );

      expect(response.errorCode).toBeUndefined();
      expect(response.data).toMatchObject({
        id: "u1",
        email: "someone@example.com",
        isEnabled: false,
        isDeleted: true,
      });
    });
  });

  describe("findPasswordAccount", () => {
    it.each([
      ["e-mail", { email: "someone@example.com" }],
      ["id", { id: "u1" }],
    ])("finds an account by its %s", async (_, by) => {
      const findOne = vi.spyOn(UserModel, "findOne").mockResolvedValue({
        id: "u1",
        email: "someone@example.com",
        password: "$2b$04$hash",
        isEnabled: true,
        isDeleted: false,
      } as unknown as UserModel);

      const account = await repositories.signIn.findPasswordAccount(by);

      expect(findOne).toHaveBeenCalledWith({ where: by });
      expect(account?.passwordHash).toBe("$2b$04$hash");
      expect(account?.user).toMatchObject({
        id: "u1",
        isEnabled: true,
        isDeleted: false,
      });
    });

    it("gives a null hash for an account without password", async () => {
      vi.spyOn(UserModel, "findOne").mockResolvedValue({
        id: "u1",
        password: "",
        isEnabled: true,
        isDeleted: false,
      } as unknown as UserModel);

      const account = await repositories.signIn.findPasswordAccount({
        id: "u1",
      });

      expect(account?.passwordHash).toBeNull();
    });

    it("gives null for an unknown account", async () => {
      vi.spyOn(UserModel, "findOne").mockResolvedValue(null);

      expect(
        await repositories.signIn.findPasswordAccount({ id: "u1" }),
      ).toBeNull();
    });
  });
});
