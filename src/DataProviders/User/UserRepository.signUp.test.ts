import { mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { IPasswordHasher } from "#src/Domain/User/Service/IPasswordHasher.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

vi.mock("#src/common/logger.js");

/**
 * The sign-up answer is the same for a taken address and a free one (UX-33):
 * the password is hashed in both cases, so the response time does not tell
 * them apart either.
 */
describe("UserRepositoryImpl.signUp with a taken address", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes the password before refusing the duplicate", async () => {
    const hasher = mock<IPasswordHasher>();
    hasher.hash.mockResolvedValue("hash");
    vi.spyOn(UserModel, "findOne").mockResolvedValue({ id: "1" } as never);
    const create = vi.spyOn(UserModel, "create");

    const response = await new UserRepositoryImpl(hasher).signUp(
      new RequestModel("signUp", {
        name: "Ana",
        email: "ana@example.com",
        password: "a long enough password",
      } as UserRegistration),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.DUPLICATE_ENTITY);
    expect(hasher.hash).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
});
