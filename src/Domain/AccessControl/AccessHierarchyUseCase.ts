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
    const operator = await this.repository.getAccountPermissions(operatorId);
    if (!operator?.isActive) return refuse(MESSAGES.noOperator);

    const held = new Set(operator.permissions);
    const isTop = held.has(TOP_PERMISSION);
    const includes = (permissions: readonly string[]) =>
      isTop || permissions.every((permission) => held.has(permission));

    const leavesNoTop = async (removal: Removal) => {
      const remaining = (
        await this.repository.listActiveHolders(TOP_PERMISSION)
      ).filter(
        (holder) =>
          !(
            (removal.userId === undefined ||
              holder.userId === removal.userId) &&
            (removal.roleId === undefined || holder.roleId === removal.roleId)
          ),
      );
      return remaining.length === 0;
    };

    switch (check.kind) {
      case "assign-role":
      case "remove-role": {
        if (check.userId === operatorId) return refuse(MESSAGES.self);
        const target = await this.repository.getAccountPermissions(
          check.userId,
        );
        if (target && !includes(target.permissions)) {
          return refuse(MESSAGES.account);
        }
        const rolePermissions = await this.repository.getRolePermissions(
          check.roleId,
        );
        if (rolePermissions && !includes(rolePermissions)) {
          return refuse(MESSAGES.role);
        }
        if (
          check.kind === "remove-role" &&
          rolePermissions?.includes(TOP_PERMISSION) &&
          (await leavesNoTop({ userId: check.userId, roleId: check.roleId }))
        ) {
          return refuse(MESSAGES.lastTop);
        }
        return response;
      }

      case "add-permission":
      case "remove-permission": {
        const rolePermissions = await this.repository.getRolePermissions(
          check.roleId,
        );
        if (!rolePermissions) return response;
        const name = await this.repository.getPermissionName(
          check.permissionId,
        );
        if (!includes(name ? [...rolePermissions, name] : rolePermissions)) {
          return refuse(MESSAGES.role);
        }
        if (
          check.kind === "remove-permission" &&
          name === TOP_PERMISSION &&
          (await leavesNoTop({ roleId: check.roleId }))
        ) {
          return refuse(MESSAGES.lastTop);
        }
        return response;
      }

      case "update-role":
      case "delete-role": {
        const rolePermissions = await this.repository.getRolePermissions(
          check.roleId,
        );
        if (!rolePermissions) return response;
        if (!includes(rolePermissions)) return refuse(MESSAGES.role);
        if (
          check.kind === "delete-role" &&
          rolePermissions.includes(TOP_PERMISSION) &&
          (await leavesNoTop({ roleId: check.roleId }))
        ) {
          return refuse(MESSAGES.lastTop);
        }
        return response;
      }

      default: {
        const isSelf = check.userId === operatorId;
        if (
          isSelf &&
          (check.kind === "disable-account" || check.kind === "delete-account")
        ) {
          return refuse(MESSAGES.self);
        }
        const target = await this.repository.getAccountPermissions(
          check.userId,
        );
        if (!target) return response;
        if (!includes(target.permissions)) return refuse(MESSAGES.account);
        if (
          (check.kind === "disable-account" ||
            check.kind === "delete-account") &&
          target.permissions.includes(TOP_PERMISSION) &&
          (await leavesNoTop({ userId: check.userId }))
        ) {
          return refuse(MESSAGES.lastTop);
        }
        return response;
      }
    }
  }
}
