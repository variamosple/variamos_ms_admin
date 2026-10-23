import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
export class Email {
  private readonly value: string;
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  public constructor(value: string) {
    const cleaned = (value || "").trim().toLowerCase();
    if (!cleaned || !Email.EMAIL_REGEX.test(cleaned)) {
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
