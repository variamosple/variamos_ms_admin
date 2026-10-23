import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
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
      throw new DomainError(DomainErrorCodes.INVALID_INPUT, policy.describe());
    }
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }
}
