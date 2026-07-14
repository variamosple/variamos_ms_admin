import { PASSWORD_REGEXP } from "./ValidationConstants";

describe("Validation Constants & Messages - Unit Tests", () => {
  describe("PASSWORD_REGEXP", () => {
    it("should accept valid passwords", () => {
      expect(PASSWORD_REGEXP.test("Abcdefg1!")).toBe(true);
      expect(PASSWORD_REGEXP.test("SecurePassword2026_")).toBe(true);
    });

    it("should reject passwords that are too short (< 8 chars)", () => {
      expect(PASSWORD_REGEXP.test("Abc1!")).toBe(false);
    });

    it("should reject passwords that are too long (> 24 chars)", () => {
      expect(PASSWORD_REGEXP.test("A".repeat(25) + "a1!")).toBe(false);
    });

    it("should reject passwords missing a lowercase letter", () => {
      expect(PASSWORD_REGEXP.test("ABCDEFG1!")).toBe(false);
    });

    it("should reject passwords missing an uppercase letter", () => {
      expect(PASSWORD_REGEXP.test("abcdefg1!")).toBe(false);
    });

    it("should reject passwords missing a number", () => {
      expect(PASSWORD_REGEXP.test("Abcdefgh!")).toBe(false);
    });

    it("should reject passwords missing a special character", () => {
      expect(PASSWORD_REGEXP.test("Abcdefgh1")).toBe(false);
    });
  });
});
