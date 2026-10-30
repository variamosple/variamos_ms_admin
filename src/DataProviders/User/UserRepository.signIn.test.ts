import bcrypt from "bcrypt";
import logger from "#src/common/logger.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import { BcryptPasswordHasher } from "#src/Infrastructure/Security/BcryptPasswordHasher.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

vi.mock("#src/common/logger.js");

describe("UserRepositoryImpl.signIn account enumeration", () => {
  const repository = new UserRepositoryImpl(
    new BcryptPasswordHasher({ getCost: async () => 4 }),
  );
  const signIn = () =>
    repository.signIn(
      new RequestModel<Credentials>("signIn", {
        email: "someone@example.com",
        password: "Password1!",
      } as Credentials),
    );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["an unknown account", null],
    [
      "a disabled account",
      { id: "u1", password: "$2b$04$hash", isEnabled: false, isDeleted: false },
    ],
    [
      "a deleted account",
      { id: "u1", password: "$2b$04$hash", isEnabled: true, isDeleted: true },
    ],
    [
      "an account without password",
      { id: "u1", password: null, isEnabled: true, isDeleted: false },
    ],
  ])(
    "compares a hash for %s, then refuses with the usual message",
    async (_label, dbUser) => {
      vi.spyOn(UserModel, "findOne").mockResolvedValue(
        dbUser as unknown as UserModel,
      );
      const compare = vi.spyOn(bcrypt, "compare");

      const response = await signIn();

      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare.mock.calls[0]?.[1]).toMatch(/^\$2[aby]\$/);
      expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(response.message).toBe("Incorrect username or password.");
    },
  );

  it("compares against the account hash for an active account", async () => {
    const hash = await bcrypt.hash("Other1!", 4);
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      password: hash,
      isEnabled: true,
      isDeleted: false,
    } as unknown as UserModel);
    const compare = vi.spyOn(bcrypt, "compare");

    const response = await signIn();

    expect(compare).toHaveBeenCalledWith("Password1!", hash);
    expect(response.message).toBe("Incorrect username or password.");
  });
});

describe("UserRepositoryImpl.signIn hash upgrade (EV-46)", () => {
  let cost = 5;
  const hasher = new BcryptPasswordHasher({ getCost: async () => cost });
  const repository = new UserRepositoryImpl(hasher);
  const signIn = (password = "Password1!") =>
    repository.signIn(
      new RequestModel<Credentials>("signIn", {
        email: "someone@example.com",
        password,
      } as Credentials),
    );
  const accountHashedAt = async (hashCost: number) => {
    const hash = await bcrypt.hash("Password1!", hashCost);
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      user: "someone",
      name: "Someone",
      email: "someone@example.com",
      password: hash,
      isEnabled: true,
      isDeleted: false,
    } as unknown as UserModel);
    return hash;
  };
  const savedFields = (update: ReturnType<typeof vi.spyOn>) =>
    update.mock.calls[0]?.[0] as { lastLogin?: Date; password?: string };

  beforeEach(() => {
    cost = 5;
    // Roles and permissions of the signed in user
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["lower", 4],
    ["higher", 6],
  ])(
    "saves a hash at the current cost when the old one is %s",
    async (_label, hashCost) => {
      await accountHashedAt(hashCost);
      const update = vi
        .spyOn(UserModel, "update")
        .mockResolvedValue([1] as never);

      const response = await signIn();

      expect(response.errorCode).toBeUndefined();
      const saved = savedFields(update);
      expect(saved.lastLogin).toBeInstanceOf(Date);
      expect(bcrypt.getRounds(saved.password as string)).toBe(5);
      expect(await bcrypt.compare("Password1!", saved.password as string)).toBe(
        true,
      );
    },
  );

  it("keeps the hash made at the current cost", async () => {
    await accountHashedAt(5);
    const update = vi
      .spyOn(UserModel, "update")
      .mockResolvedValue([1] as never);

    const response = await signIn();

    expect(response.errorCode).toBeUndefined();
    expect(savedFields(update)).not.toHaveProperty("password");
  });

  it("signs in without a new hash when hashing again fails", async () => {
    await accountHashedAt(4);
    vi.spyOn(hasher, "hash").mockRejectedValue(new Error("hashing failed"));
    const update = vi
      .spyOn(UserModel, "update")
      .mockResolvedValue([1] as never);

    const response = await signIn();

    expect(response.errorCode).toBeUndefined();
    expect(savedFields(update)).not.toHaveProperty("password");
    expect(logger.err).toHaveBeenCalledWith(
      expect.stringContaining("Password rehash failed for user u1"),
    );
  });

  it("does not hash again after a wrong password", async () => {
    await accountHashedAt(4);
    const update = vi.spyOn(UserModel, "update");
    const hash = vi.spyOn(hasher, "hash");

    const response = await signIn("Wrong1!");

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(hash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
