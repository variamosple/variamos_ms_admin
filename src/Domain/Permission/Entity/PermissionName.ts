import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

// "roles::read" or "admin::roles::read": lowercase words, digits and dashes
const PERMISSION_NAME = /^(?:[a-z0-9-]+::)?[a-z0-9-]+::[a-z0-9-]+$/;

/** The name of a permission: a resource and an action, maybe a scope (EV-24). */
export class PermissionName {
  private readonly value: string;

  public constructor(value: string) {
    if (!PermissionName.isValid(value)) {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "Permission name must follow the 'resource::action' or 'scope::resource::action' format (e.g. 'admin::roles::read').",
      );
    }
    this.value = value.trim();
  }

  /** Whether a name would be accepted, without throwing. */
  public static isValid(value: string | null | undefined): boolean {
    return Boolean(value) && PERMISSION_NAME.test(value ?? "");
  }

  public getValue(): string {
    return this.value;
  }
}
