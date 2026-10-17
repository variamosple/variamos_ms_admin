import { PasswordPolicy } from "./PasswordPolicy.js";

/**
 * A password checked against a policy. Built without one, it checks only the
 * length bounds; the use cases then apply the configured policy
 * (PasswordPolicyService) before storing it.
 */
export class Password {
  private readonly value: string;

  public constructor(
    value: string,
    policy: PasswordPolicy = PasswordPolicy.BASELINE,
  ) {
    if (!value || policy.violations(value).length > 0) {
      throw new Error(policy.describe());
    }
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }
}
