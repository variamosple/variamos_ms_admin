/** Longest accepted password (NIST SP 800-63B: accept at least 64). */
export const PASSWORD_MAX_LENGTH = 64;
/** The configured minimum never goes below this. */
export const PASSWORD_MIN_LENGTH_FLOOR = 8;

export interface PasswordPolicyRules {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
}

/**
 * Password rules (EV-87 lot 3). The configured rules come from the
 * security.password.* keys; a lowercase letter is always required, since no
 * key sets it. Applied to new passwords only: existing ones stay valid.
 */
export class PasswordPolicy {
  /** The rule used when the keys are missing or invalid. */
  public static readonly DEFAULT = new PasswordPolicy({
    minLength: PASSWORD_MIN_LENGTH_FLOOR,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecial: true,
  });

  /** Only the length bounds: what any configured policy accepts. */
  public static readonly BASELINE = new PasswordPolicy(
    {
      minLength: PASSWORD_MIN_LENGTH_FLOOR,
      requireUppercase: false,
      requireNumbers: false,
      requireSpecial: false,
    },
    false,
  );

  public readonly minLength: number;
  public readonly maxLength = PASSWORD_MAX_LENGTH;
  public readonly requireUppercase: boolean;
  public readonly requireNumbers: boolean;
  public readonly requireSpecial: boolean;

  private constructor(
    rules: PasswordPolicyRules,
    public readonly requireLowercase = true,
  ) {
    this.minLength = Math.min(
      PASSWORD_MAX_LENGTH,
      Math.max(PASSWORD_MIN_LENGTH_FLOOR, Math.trunc(rules.minLength)),
    );
    this.requireUppercase = rules.requireUppercase;
    this.requireNumbers = rules.requireNumbers;
    this.requireSpecial = rules.requireSpecial;
  }

  /** Bounds the configured values; an invalid value takes the default. */
  public static fromConfiguration(values: {
    minLength?: unknown;
    requireUppercase?: unknown;
    requireNumbers?: unknown;
    requireSpecial?: unknown;
  }): PasswordPolicy {
    const flag = (value: unknown, fallback: boolean) =>
      typeof value === "boolean" ? value : fallback;
    const defaults = PasswordPolicy.DEFAULT;
    return new PasswordPolicy({
      minLength:
        typeof values.minLength === "number" &&
        Number.isFinite(values.minLength)
          ? values.minLength
          : defaults.minLength,
      requireUppercase: flag(
        values.requireUppercase,
        defaults.requireUppercase,
      ),
      requireNumbers: flag(values.requireNumbers, defaults.requireNumbers),
      requireSpecial: flag(values.requireSpecial, defaults.requireSpecial),
    });
  }

  /** The rules this password breaks, empty when it is accepted. */
  public violations(password: string): string[] {
    const broken: string[] = [];
    // Length in characters, not UTF-16 units
    const length = [...password].length;
    if (length < this.minLength || length > this.maxLength)
      broken.push("length");
    if (this.requireLowercase && !/\p{Ll}/u.test(password))
      broken.push("lowercase");
    if (this.requireUppercase && !/\p{Lu}/u.test(password))
      broken.push("uppercase");
    if (this.requireNumbers && !/\p{Nd}/u.test(password)) broken.push("number");
    if (this.requireSpecial && !/[^\p{L}\p{Nd}]/u.test(password)) {
      broken.push("special");
    }
    return broken;
  }

  /** The rule in one sentence, as shown to the user. */
  public describe(): string {
    const parts = [
      this.requireUppercase && "uppercase",
      this.requireLowercase && "lowercase",
      this.requireNumbers && "number",
      this.requireSpecial && "special character",
    ].filter(Boolean) as string[];
    const length = `Password must be between ${this.minLength} and ${this.maxLength} characters long`;
    if (parts.length === 0) return `${length}.`;
    const list =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
    return `${length} and contain ${list}.`;
  }

  public toJSON() {
    return {
      minLength: this.minLength,
      maxLength: this.maxLength,
      requireUppercase: this.requireUppercase,
      requireLowercase: this.requireLowercase,
      requireNumbers: this.requireNumbers,
      requireSpecial: this.requireSpecial,
    };
  }
}
