import { Password } from "./Password.js";
import { PasswordPolicy } from "./PasswordPolicy.js";

describe("Password Value Object", () => {
  it("accepts a password within the length bounds", () => {
    expect(new Password("SecurePass123!").getValue()).toBe("SecurePass123!");
  });

  it.each([
    "SecurePass123#",
    "SecurePass123_",
    "Secure Pass123",
    "SecurePass123(",
  ])("accepts any special character, as the UI does: %s", (value) => {
    expect(new Password(value, PasswordPolicy.DEFAULT).getValue()).toBe(value);
  });

  it("checks only the length bounds without a policy", () => {
    expect(new Password("lowercase").getValue()).toBe("lowercase");
    expect(() => new Password("Sec1!")).toThrow(
      "Password must be between 8 and 64 characters long.",
    );
    expect(() => new Password(`${"Aa1!".repeat(16)}x`)).toThrow();
  });

  it("applies the given policy and states it in the error", () => {
    expect(() => new Password("SecurePass!", PasswordPolicy.DEFAULT)).toThrow(
      "Password must be between 8 and 64 characters long and contain uppercase, lowercase, number, and special character.",
    );
  });

  it("refuses an empty password", () => {
    expect(() => new Password("")).toThrow();
  });
});
