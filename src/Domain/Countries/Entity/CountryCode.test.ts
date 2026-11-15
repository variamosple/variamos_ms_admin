import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { CountryCode } from "./CountryCode.js";

describe("CountryCode (EV-47)", () => {
  it("accepts two letters, in capitals and without spaces", () => {
    expect(new CountryCode("FR").getValue()).toBe("FR");
    expect(new CountryCode(" co ").getValue()).toBe("CO");
  });

  it.each(["FRA", "F", "", "  ", "F1", "--"])("refuses %j", (code) => {
    expect(CountryCode.isValid(code)).toBe(false);
    expect(() => new CountryCode(code)).toThrow(
      expect.objectContaining({ code: DomainErrorCodes.INVALID_INPUT }),
    );
    expect(() => new CountryCode(code)).toThrow(DomainError);
  });

  it("gives no country for a missing or blank one", () => {
    expect(CountryCode.optional(null)).toBeNull();
    expect(CountryCode.optional(undefined)).toBeNull();
    expect(CountryCode.optional(" ")).toBeNull();
    expect(CountryCode.optional("us")).toBe("US");
    expect(() => CountryCode.optional("USA")).toThrow(DomainError);
  });
});
