import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

// ISO 3166-1 alpha-2: two capital letters, "FR", never "FRA"
const ALPHA_2 = /^[A-Z]{2}$/;

/** The code of a country, as accounts store it (EV-47). */
export class CountryCode {
  private readonly value: string;

  /** Spaces around and the case do not matter: " fr " is "FR". */
  public constructor(value: string) {
    const code = CountryCode.clean(value);
    if (!ALPHA_2.test(code)) {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "The country code must be two letters.",
      );
    }
    this.value = code;
  }

  private static clean(value: string | null | undefined): string {
    return (value ?? "").trim().toUpperCase();
  }

  /** Whether a code would be accepted, without throwing. */
  public static isValid(value: string | null | undefined): boolean {
    return ALPHA_2.test(CountryCode.clean(value));
  }

  /** The code of an optional country: none for a missing or blank one. */
  public static optional(
    value: Nullable<string> | undefined,
  ): Nullable<string> {
    return CountryCode.clean(value) === ""
      ? null
      : new CountryCode(value ?? "").getValue();
  }

  public getValue(): string {
    return this.value;
  }
}
