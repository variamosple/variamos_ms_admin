import { RolePermissionRepositoryInstance } from "@src/DataProviders/Role/RolePermissionRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "../Permission/Entity/Permission";
import { RolePermission } from "./Entity/RolePermission";
import { RolePermissionFilter } from "./Entity/RolePermissionFilter";

export class RolePermissionUseCases {
  queryRolePermissions(
    request: RequestModel<RolePermissionFilter>
  ): Promise<ResponseModel<Permission[]>> {
    return RolePermissionRepositoryInstance.queryRolePermissions(request);
  }

  createRolePermission(
    request: RequestModel<RolePermission>
  ): Promise<ResponseModel<RolePermission>> {
    return RolePermissionRepositoryInstance.createRolePermission(request);
  }

  deleteRolePermission(
    request: RequestModel<RolePermission>
  ): Promise<ResponseModel<void>> {
    return RolePermissionRepositoryInstance.deleteRolePermission(request);
  }
}
