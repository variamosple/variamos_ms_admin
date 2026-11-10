import {
  DEFAULT_PASSWORD_HASHING_COST,
  passwordHashingCostOf,
} from "./PasswordHashingCost.js";

describe("passwordHashingCostOf", () => {
  it.each([10, 12, 14])("takes the configured cost %s", (cost) => {
    expect(passwordHashingCostOf(cost, 11)).toBe(cost);
  });

  it.each([
    ["below the OWASP floor", 9],
    ["above the ceiling", 15],
    ["not an integer", 11.5],
    ["text", "12"],
    ["missing", undefined],
  ])(
    "falls back on the environment when the configured cost is %s",
    (_label, configured) => {
      expect(passwordHashingCostOf(configured, 11)).toBe(11);
    },
  );

  it("takes the default when the environment is out of bounds too", () => {
    expect(passwordHashingCostOf(undefined, 4)).toBe(
      DEFAULT_PASSWORD_HASHING_COST,
    );
    expect(DEFAULT_PASSWORD_HASHING_COST).toBe(10);
  });
});
