export class Password {
  private readonly value: string;
  private static readonly PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  public constructor(value: string) {
    if (!value || !Password.PASSWORD_REGEX.test(value)) {
      throw new Error(
        "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.",
      );
    }
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }
}
