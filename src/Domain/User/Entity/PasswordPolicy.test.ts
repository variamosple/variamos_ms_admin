import { PasswordPolicy } from "./PasswordPolicy.js";

describe("PasswordPolicy", () => {
  const policy = (
    values: Parameters<typeof PasswordPolicy.fromConfiguration>[0],
  ) => PasswordPolicy.fromConfiguration(values);

  it("keeps the current rule when no key is set", () => {
    expect(policy({}).toJSON()).toEqual({
      minLength: 8,
      maxLength: 64,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: true,
    });
  });

  it.each([
    ["below the floor", 4, 8],
    ["above the maximum", 100, 64],
    ["a decimal", 12.7, 12],
    ["not a number", "12", 8],
    ["infinite", Number.POSITIVE_INFINITY, 8],
  ])("bounds a minimum length %s", (_label, minLength, expected) => {
    expect(policy({ minLength }).minLength).toBe(expected);
  });

  it("ignores a flag that is not a boolean", () => {
    expect(policy({ requireSpecial: "false" }).requireSpecial).toBe(true);
  });

  it.each([
    ["a too short password", { minLength: 12 }, "Short1!aaaa", ["length"]],
    ["a missing number", {}, "NoNumber!!", ["number"]],
    ["a missing special character", {}, "NoSpecial12", ["special"]],
    ["a missing uppercase", {}, "lowercase1!", ["uppercase"]],
    ["a missing lowercase", {}, "UPPERCASE12!", ["lowercase"]],
  ])("reports %s", (_label, values, password, expected) => {
    expect(policy(values).violations(password)).toEqual(expected);
  });

  it("drops the rules that the keys turn off", () => {
    const relaxed = policy({
      requireUppercase: false,
      requireNumbers: false,
      requireSpecial: false,
    });

    expect(relaxed.violations("lowercase")).toEqual([]);
    expect(relaxed.describe()).toBe(
      "Password must be between 8 and 64 characters long and contain lowercase.",
    );
  });

  it("counts characters, not UTF-16 units", () => {
    expect(policy({}).violations("Café1!Bar🔒")).toEqual([]);
  });

  it("states the configured length", () => {
    expect(policy({ minLength: 12 }).describe()).toBe(
      "Password must be between 12 and 64 characters long and contain uppercase, lowercase, number, and special character.",
    );
  });
});
