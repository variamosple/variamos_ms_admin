import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import type { RolePermission } from "@src/Domain/Role/Entity/RolePermission.js";
import type { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter.js";
import type { IRolePermissionRepository } from "@src/Domain/Role/Repository/IRolePermissionRepository.js";

export class RolePermissionUseCase {
  public constructor(
    private readonly rolePermissionRepository: IRolePermissionRepository,
  ) {}

  public queryRolePermissions(
    request: RequestModel<RolePermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    return this.rolePermissionRepository.queryRolePermissions(request);
  }

  public createRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<RolePermission>> {
    return this.rolePermissionRepository.createRolePermission(request);
  }

  public deleteRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<void>> {
    return this.rolePermissionRepository.deleteRolePermission(request);
  }
}
