import { Password } from "./Password";

describe("Password Value Object", () => {
  it("should create a valid password successfully", () => {
    const password = new Password("SecurePass123!");
    expect(password.getValue()).toBe("SecurePass123!");
  });

  const expectedError =
    "Password must be between 8 and 24 characters long and contain uppercase, lowercase, number, and special character.";

  it("should throw an error for password without numbers", () => {
    expect(() => new Password("SecurePass!")).toThrow(expectedError);
  });

  it("should throw an error for password without special character", () => {
    expect(() => new Password("SecurePass123")).toThrow(expectedError);
  });

  it("should throw an error for password too short", () => {
    expect(() => new Password("Sec1!")).toThrow(expectedError);
  });

  it("should throw an error for password too long", () => {
    expect(() => new Password("SecurePass123!SecurePass123!")).toThrow(expectedError);
  });
});
