import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  accountRefusalOf,
  canUsePassword,
  refuseClosedAccount,
} from "./AccountAccess.js";

describe("AccountAccess", () => {
  describe("accountRefusalOf", () => {
    it.each([
      [{ isEnabled: true, isDeleted: false }, null],
      [{ isEnabled: false, isDeleted: false }, "disabled"],
      [{ isEnabled: true, isDeleted: true }, "deleted"],
      // Disabled is said first, as the repository always did
      [{ isEnabled: false, isDeleted: true }, "disabled"],
      // A state that was not read is not an open account
      [{}, "disabled"],
      [{ isEnabled: null, isDeleted: null }, "disabled"],
      [{ isEnabled: true, isDeleted: null }, null],
    ])("%o gives %s", (state, refusal) => {
      expect(accountRefusalOf(state)).toBe(refusal);
    });
  });

  describe("canUsePassword", () => {
    const open = { isEnabled: true, isDeleted: false };

    it("accepts an open account with a password", () => {
      expect(canUsePassword({ user: open, passwordHash: "$2b$hash" })).toBe(
        true,
      );
    });

    it.each([
      ["no account", null],
      ["no password", { user: open, passwordHash: null }],
      ["an empty password", { user: open, passwordHash: "" }],
      [
        "a disabled account",
        { user: { isEnabled: false, isDeleted: false }, passwordHash: "$2b$" },
      ],
      [
        "a deleted account",
        { user: { isEnabled: true, isDeleted: true }, passwordHash: "$2b$" },
      ],
    ])("refuses %s", (_, account) => {
      expect(canUsePassword(account)).toBe(false);
    });
  });

  describe("refuseClosedAccount", () => {
    const read = (state: { isEnabled: boolean; isDeleted: boolean }) =>
      new ResponseModel<typeof state>("tx-1").withResponse(state);

    it("passes on the response of an open account", () => {
      const response = read({ isEnabled: true, isDeleted: false });

      expect(refuseClosedAccount(response, DomainErrorCodes.FORBIDDEN)).toBe(
        response,
      );
    });

    it("passes on a failed read", () => {
      const response = new ResponseModel<{ isEnabled: boolean }>(
        "tx-1",
      ).withError(DomainErrorCodes.ENTITY_NOT_FOUND, "User not found.");

      expect(refuseClosedAccount(response, DomainErrorCodes.FORBIDDEN)).toBe(
        response,
      );
    });

    it.each([
      [false, false, "Your account is disabled."],
      [true, true, "Your account is deleted."],
    ])(
      "refuses a closed account under the caller's code, without its data",
      (isEnabled, isDeleted, message) => {
        const refused = refuseClosedAccount(
          read({ isEnabled, isDeleted }),
          DomainErrorCodes.FORBIDDEN,
        );

        expect(refused.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
        expect(refused.message).toBe(message);
        expect(refused.transactionId).toBe("tx-1");
        expect(refused.data).toBeUndefined();
      },
    );
  });
});
