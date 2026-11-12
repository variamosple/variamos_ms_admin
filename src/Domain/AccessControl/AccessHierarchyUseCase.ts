import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { AccessCheck } from "./AccessCheck.js";
import type { IAccessHierarchyRepository } from "./IAccessHierarchyRepository.js";

/**
 * Holders of this permission are at the top of the hierarchy: whoever can
 * create permissions can already grant anything.
 */
export const TOP_PERMISSION = "permissions::create";

const MESSAGES = {
  noOperator: "Your session does not allow this action.",
  self: "You cannot perform this action on your own account.",
  account: "You cannot manage an account with permissions you do not hold.",
  role: "You cannot manage a role with permissions you do not hold.",
  lastTop: "This would leave no active account able to manage permissions.",
} as const;

type Removal = { userId?: string; roleId?: number };
type CheckOf<Kind extends AccessCheck["kind"]> = Extract<
  AccessCheck,
  { kind: Kind }
>;

/** The operator of a check, and whether they hold a set of permissions. */
interface Operator {
  id: string;
  includes: (permissions: readonly string[]) => boolean;
}

// Each refusal names its reason; null lets the operation go on
type Refusal = string | null;

/**
 * Role hierarchy (EV-70 lot 2, T-10). An operator manages a role or an
 * account only if all its permissions are included in the operator's; the
 * top (TOP_PERMISSION) manages everything. Nobody acts on their own account,
 * and the last active top account cannot lose its access. Permissions are
 * read from the database, not from the session token, which may be old.
 */
export class AccessHierarchyUseCase {
  public constructor(private readonly repository: IAccessHierarchyRepository) {}

  public async authorize(
    operatorId: string | undefined,
    check: AccessCheck,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>("authorizeAccess");
    const refuse = (message: string) =>
      response.withError(DomainErrorCodes.FORBIDDEN, message);

    if (!operatorId) return refuse(MESSAGES.noOperator);
    const account = await this.repository.getAccountPermissions(operatorId);
    if (!account?.isActive) return refuse(MESSAGES.noOperator);

    const held = new Set(account.permissions);
    const isTop = held.has(TOP_PERMISSION);
    const operator: Operator = {
      id: operatorId,
      includes: (permissions) =>
        isTop || permissions.every((permission) => held.has(permission)),
    };

    const refusal = await this.refusalOf(operator, check);
    return refusal ? refuse(refusal) : response;
  }

  private refusalOf(operator: Operator, check: AccessCheck): Promise<Refusal> {
    switch (check.kind) {
      case "assign-role":
      case "remove-role":
        return this.roleAssignmentRefusal(operator, check);
      case "add-permission":
      case "remove-permission":
        return this.rolePermissionRefusal(operator, check);
      case "update-role":
      case "delete-role":
        return this.roleRefusal(operator, check);
      default:
        return this.accountRefusal(operator, check);
    }
  }

  private async roleAssignmentRefusal(
    operator: Operator,
    check: CheckOf<"assign-role" | "remove-role">,
  ): Promise<Refusal> {
    if (check.userId === operator.id) return MESSAGES.self;
    const target = await this.repository.getAccountPermissions(check.userId);
    if (target && !operator.includes(target.permissions)) {
      return MESSAGES.account;
    }
    const rolePermissions = await this.repository.getRolePermissions(
      check.roleId,
    );
    if (rolePermissions && !operator.includes(rolePermissions)) {
      return MESSAGES.role;
    }
    if (
      check.kind === "remove-role" &&
      rolePermissions?.includes(TOP_PERMISSION) &&
      (await this.leavesNoTop({ userId: check.userId, roleId: check.roleId }))
    ) {
      return MESSAGES.lastTop;
    }
    return null;
  }

  private async rolePermissionRefusal(
    operator: Operator,
    check: CheckOf<"add-permission" | "remove-permission">,
  ): Promise<Refusal> {
    const rolePermissions = await this.repository.getRolePermissions(
      check.roleId,
    );
    if (!rolePermissions) return null;
    const name = await this.repository.getPermissionName(check.permissionId);
    if (
      !operator.includes(name ? [...rolePermissions, name] : rolePermissions)
    ) {
      return MESSAGES.role;
    }
    if (
      check.kind === "remove-permission" &&
      name === TOP_PERMISSION &&
      (await this.leavesNoTop({ roleId: check.roleId }))
    ) {
      return MESSAGES.lastTop;
    }
    return null;
  }

  private async roleRefusal(
    operator: Operator,
    check: CheckOf<"update-role" | "delete-role">,
  ): Promise<Refusal> {
    const rolePermissions = await this.repository.getRolePermissions(
      check.roleId,
    );
    if (!rolePermissions) return null;
    if (!operator.includes(rolePermissions)) return MESSAGES.role;
    if (
      check.kind === "delete-role" &&
      rolePermissions.includes(TOP_PERMISSION) &&
      (await this.leavesNoTop({ roleId: check.roleId }))
    ) {
      return MESSAGES.lastTop;
    }
    return null;
  }

  private async accountRefusal(
    operator: Operator,
    check: CheckOf<
      | "disable-account"
      | "enable-account"
      | "delete-account"
      | "recovery-link"
      | "reset-mfa"
    >,
  ): Promise<Refusal> {
    const closes =
      check.kind === "disable-account" || check.kind === "delete-account";
    // Turning off one's own second factor asks for a code (/auth/mfa)
    if (
      check.userId === operator.id &&
      (closes || check.kind === "reset-mfa")
    ) {
      return MESSAGES.self;
    }
    const target = await this.repository.getAccountPermissions(check.userId);
    if (!target) return null;
    if (!operator.includes(target.permissions)) return MESSAGES.account;
    if (
      closes &&
      target.permissions.includes(TOP_PERMISSION) &&
      (await this.leavesNoTop({ userId: check.userId }))
    ) {
      return MESSAGES.lastTop;
    }
    return null;
  }

  // True when no other active account would hold the top permission
  private async leavesNoTop(removal: Removal): Promise<boolean> {
    const remaining = (
      await this.repository.listActiveHolders(TOP_PERMISSION)
    ).filter(
      (holder) =>
        !(
          (removal.userId === undefined || holder.userId === removal.userId) &&
          (removal.roleId === undefined || holder.roleId === removal.roleId)
        ),
    );
    return remaining.length === 0;
  }
}
