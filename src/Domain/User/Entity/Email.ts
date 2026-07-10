export class Email {
  private readonly value: string;
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  public constructor(value: string) {
    const cleaned = (value || "").trim().toLowerCase();
    if (!cleaned || !Email.EMAIL_REGEX.test(cleaned)) {
      throw new Error("Invalid email format.");
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
