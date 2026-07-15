export class Password {
  private readonly value: string;
  private static readonly PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,24}$/;

  public constructor(value: string) {
    if (!value || !Password.PASSWORD_REGEX.test(value)) {
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
