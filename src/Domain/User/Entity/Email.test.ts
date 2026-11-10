import { Email } from "./Email.js";

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

  // The expression replaced in Email, kept here to check that the same
  // addresses are accepted
  const FORMER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const accepts = (address: string) => {
    try {
      new Email(address);
      return true;
    } catch {
      return false;
    }
  };

  it.each([
    "a@b.c",
    "first.last@sub.example.org",
    "a@b..c",
    "a@b.c.",
    "a+tag@example.co",
    "a@.b",
    "a@b.",
    "a@bc",
    "@b.c",
    "a@@b.c",
    "a@b@c.d",
    "a b@c.d",
    "a@b\t.c",
    "a@.",
    "a@..",
    "a@...",
  ])("accepts %j exactly when the former expression did", (address) => {
    expect(accepts(address)).toBe(FORMER_EMAIL_REGEX.test(address));
  });

  it("reads a long hostile address in linear time", () => {
    // A space before the end: refused, after a long search by the former
    // expression (the trim of the constructor keeps it)
    const hostile = `a@${".".repeat(100_000)} x`;
    const start = performance.now();

    expect(accepts(hostile)).toBe(false);
    // The former expression took about 9 s here
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("should check equality with other email instances", () => {
    const email1 = new Email("test@example.com");
    const email2 = new Email("TEST@EXAMPLE.COM");
    const email3 = new Email("other@example.com");

    expect(email1.equals(email2)).toBe(true);
    expect(email1.equals(email3)).toBe(false);
  });
});
