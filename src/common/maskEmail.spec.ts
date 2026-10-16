import { maskEmail } from "./maskEmail.js";

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
  });

  it("uses the last @ to find the domain", () => {
    expect(maskEmail('"a@b"@example.com')).toBe('"***@example.com');
  });

  it.each(["", "not-an-email", "@example.com"])(
    "fully masks %j, which has no local part",
    (value) => {
      expect(maskEmail(value)).toBe("***");
    },
  );
});
