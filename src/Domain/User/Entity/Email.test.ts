import { Email } from "./Email";

describe("Email Value Object", () => {
  it("should create a valid email successfully and normalize it", () => {
    const email = new Email(" TEST@example.com ");
    expect(email.getValue()).toBe("test@example.com");
  });

  it("should throw an error for invalid email formats", () => {
    expect(() => new Email("")).toThrow("Invalid email format.");
    expect(() => new Email("invalid-email")).toThrow("Invalid email format.");
    expect(() => new Email("invalid@example")).toThrow("Invalid email format.");
  });

  it("should check equality with other email instances", () => {
    const email1 = new Email("test@example.com");
    const email2 = new Email("TEST@EXAMPLE.COM");
    const email3 = new Email("other@example.com");

    expect(email1.equals(email2)).toBe(true);
    expect(email1.equals(email3)).toBe(false);
  });
});
