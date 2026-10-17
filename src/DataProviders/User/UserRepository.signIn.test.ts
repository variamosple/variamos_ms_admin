import bcrypt from "bcrypt";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

describe("UserRepositoryImpl.signIn account enumeration", () => {
  const repository = new UserRepositoryImpl({ bcryptSaltRounds: 4 });
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
