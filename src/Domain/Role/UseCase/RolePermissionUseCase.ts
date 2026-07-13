import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission";
import { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter";
import { IRolePermissionRepository } from "@src/Domain/Role/Repository/IRolePermissionRepository";

export class RolePermissionUseCase {
  public constructor(private readonly rolePermissionRepository: IRolePermissionRepository) {}

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

  public deleteRolePermission(request: RequestModel<RolePermission>): Promise<ResponseModel<void>> {
    return this.rolePermissionRepository.deleteRolePermission(request);
  }
}
