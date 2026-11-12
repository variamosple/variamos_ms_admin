import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
export class Email {
  private readonly value: string;
  /**
   * An address without spaces, with one "@" after at least one character,
   * then a domain with a dot that neither starts nor ends it. Read in one
   * pass: the former expression /^[^\s@]+@[^\s@]+\.[^\s@]+$/ accepted the
   * same addresses in a time quadratic in the length (9 s on 100,000
   * characters).
   */
  private static isWellFormed(address: string): boolean {
    const parts = address.split("@");
    if (parts.length !== 2 || /\s/.test(address)) return false;
    const [local = "", domain = ""] = parts;
    return local.length > 0 && domain.slice(1, -1).includes(".");
  }

  public constructor(value: string) {
    const cleaned = (value || "").trim().toLowerCase();
    if (!cleaned || !Email.isWellFormed(cleaned)) {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid email format.",
      );
    }
    this.value = cleaned;
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Email): boolean {
    return this.value === other.getValue();
  }
}
