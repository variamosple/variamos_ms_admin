import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import type { RolePermission } from "#src/Domain/Role/Entity/RolePermission.js";
import type { RolePermissionFilter } from "#src/Domain/Role/Entity/RolePermissionFilter.js";
import type { IRolePermissionRepository } from "#src/Domain/Role/Repository/IRolePermissionRepository.js";

export class RolePermissionUseCase {
  public constructor(
    private readonly rolePermissionRepository: IRolePermissionRepository,
    private readonly journal: IActivityJournal,
  ) {}

  public queryRolePermissions(
    request: RequestModel<RolePermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    return this.rolePermissionRepository.queryRolePermissions(request);
  }

  public createRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<RolePermission>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "role.permission.assign",
        entityType: "role",
        entityId: request.data?.roleId,
        after: { permissionId: request.data?.permissionId ?? null },
        transactionId: request.transactionId,
      },
      () => this.rolePermissionRepository.createRolePermission(request),
    );
  }

  public deleteRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<void>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "role.permission.remove",
        entityType: "role",
        entityId: request.data?.roleId,
        before: { permissionId: request.data?.permissionId ?? null },
        transactionId: request.transactionId,
      },
      () => this.rolePermissionRepository.deleteRolePermission(request),
    );
  }
}
