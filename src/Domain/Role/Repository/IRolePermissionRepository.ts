import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { RolePermission } from "../Entity/RolePermission";
import { RolePermissionFilter } from "../Entity/RolePermissionFilter";

export interface IRolePermissionRepository {
  queryRolePermissions(
    request: RequestModel<RolePermissionFilter>,
  ): Promise<ResponseModel<Permission[]>>;
  createRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<RolePermission>>;
  deleteRolePermission(request: RequestModel<RolePermission>): Promise<ResponseModel<void>>;
}
