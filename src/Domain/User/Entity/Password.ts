import { PASSWORD_REGEXP } from "#src/Domain/Validations/ValidationConstants.js";

/**
 * The one password rule, applied at sign-up, password change and reset; the
 * UI uses the same expression. Any special character is accepted.
 */
export class Password {
  private readonly value: string;

  public constructor(value: string) {
    if (!value || !PASSWORD_REGEXP.test(value)) {
      throw new Error(
        "Password must be between 8 and 24 characters long and contain uppercase, lowercase, number, and special character.",
      );
    }
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }
}
