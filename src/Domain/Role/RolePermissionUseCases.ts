import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "../Permission/Entity/Permission";
import { RolePermission } from "./Entity/RolePermission";
import { RolePermissionFilter } from "./Entity/RolePermissionFilter";
import { IRolePermissionRepository } from "./Repository/IRolePermissionRepository";

export class RolePermissionUseCases {
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
