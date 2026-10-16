import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { refuseConfigurationUpdate } from "./ConfigurationUpdateRule.js";

const existing = (
  overrides: Partial<{
    isReadOnly: boolean;
    requiresMfa: boolean;
    isSecret: boolean;
  }>,
) => ({ isReadOnly: false, requiresMfa: false, isSecret: false, ...overrides });

describe("refuseConfigurationUpdate", () => {
  it("allows a new key", () => {
    expect(refuseConfigurationUpdate("a.b", "1", null)).toBeNull();
  });

  it("allows an ordinary update", () => {
    expect(refuseConfigurationUpdate("a.b", "1", existing({}))).toBeNull();
  });

  it("refuses a read-only configuration", () => {
    expect(
      refuseConfigurationUpdate("a.b", "1", existing({ isReadOnly: true })),
    ).toEqual({
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: "Configuration 'a.b' is read-only and cannot be updated.",
    });
  });

  it("refuses an MFA-protected configuration", () => {
    expect(
      refuseConfigurationUpdate("a.b", "1", existing({ requiresMfa: true }))
        ?.errorCode,
    ).toBe(DomainErrorCodes.MFA_REQUIRED);
  });

  it("refuses the mask as the new value of a secret", () => {
    expect(
      refuseConfigurationUpdate("a.b", "********", existing({ isSecret: true }))
        ?.message,
    ).toBe("Enter a new value for the secret configuration 'a.b'.");
  });

  it("allows a new value for a secret", () => {
    expect(
      refuseConfigurationUpdate("a.b", "new", existing({ isSecret: true })),
    ).toBeNull();
  });
});
