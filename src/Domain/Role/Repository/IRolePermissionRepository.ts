import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import type { RolePermission } from "../Entity/RolePermission.js";
import type { RolePermissionFilter } from "../Entity/RolePermissionFilter.js";

export interface IRolePermissionRepository {
  queryRolePermissions(
    request: RequestModel<RolePermissionFilter>,
  ): Promise<ResponseModel<Permission[]>>;
  createRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<RolePermission>>;
  deleteRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<void>>;
}
