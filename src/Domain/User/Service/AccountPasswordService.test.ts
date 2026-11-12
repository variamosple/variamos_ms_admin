import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { IUserSignInRepository } from "#src/Domain/User/IUserSignInRepository.js";
import { AccountPasswordService } from "./AccountPasswordService.js";
import type { IPasswordHasher } from "./IPasswordHasher.js";

describe("AccountPasswordService", () => {
  const account = (isEnabled: boolean, isDeleted: boolean) => ({
    user: User.builder()
      .setId("u1")
      .setIsEnabled(isEnabled)
      .setIsDeleted(isDeleted)
      .build(),
    passwordHash: "$2b$04$hash",
  });

  // The domain refuses a closed account; the hasher only compares
  it.each([
    ["disabled", false, false],
    ["deleted", true, true],
  ])(
    "never opens a %s account, whatever the hasher answers",
    async (_, isEnabled, isDeleted) => {
      const users = mock<Pick<IUserSignInRepository, "findPasswordAccount">>();
      users.findPasswordAccount.mockResolvedValue(
        account(isEnabled, isDeleted),
      );
      const hasher = mock<IPasswordHasher>();
      hasher.verify.mockResolvedValue(true);
      const service = new AccountPasswordService(
        users,
        hasher,
        mock<ILogger>(),
      );

      expect(
        await service.accountOpenedBy({ id: "u1" }, "Right-1!"),
      ).toBeNull();
      // The comparison is still made, against no hash: same time as a wrong one
      expect(hasher.verify).toHaveBeenCalledWith("Right-1!", null);
    },
  );
});
