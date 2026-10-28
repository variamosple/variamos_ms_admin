import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  type ConfigurationValueType,
  readConfigurationValue,
  refuseConfigurationUpdate,
} from "./ConfigurationUpdateRule.js";

const existing = (
  overrides: Partial<{
    isReadOnly: boolean;
    requiresMfa: boolean;
    isSecret: boolean;
    type: ConfigurationValueType;
  }>,
) => ({
  isReadOnly: false,
  requiresMfa: false,
  isSecret: false,
  type: "string" as ConfigurationValueType,
  ...overrides,
});

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

  it("refuses a value that does not match the key's type", () => {
    expect(
      refuseConfigurationUpdate("a.b", "ten", existing({ type: "number" })),
    ).toEqual({
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: "Value for key 'a.b' must be a number.",
    });
  });
});

describe("readConfigurationValue", () => {
  it.each<[ConfigurationValueType, string, unknown]>([
    ["string", "8080", "8080"],
    ["string", "", ""],
    ["number", "15", 15],
    ["number", "1.5", 1.5],
    ["boolean", "true", true],
    ["boolean", "false", false],
    ["array", '["a","b"]', ["a", "b"]],
    ["object", '{"a":1}', { a: 1 }],
  ])("reads a %s from %j", (type, raw, expected) => {
    expect(readConfigurationValue(raw, type)).toEqual(expected);
  });

  it.each<[ConfigurationValueType, string]>([
    ["number", ""],
    ["number", " "],
    ["number", "ten"],
    ["number", "Infinity"],
    ["boolean", "yes"],
    ["boolean", "True"],
    ["array", "a,b"],
    ["array", "[1,2]"],
    ["array", '{"a":1}'],
    ["object", "[]"],
    ["object", "null"],
    ["object", "a=1"],
  ])("refuses a %s from %j", (type, raw) => {
    expect(readConfigurationValue(raw, type)).toBeUndefined();
  });
});
