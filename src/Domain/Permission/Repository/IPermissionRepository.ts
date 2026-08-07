import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "../Entity/Permission.js";
import type { PermissionFilter } from "../Entity/PermissionFilter.js";

export interface IPermissionRepository {
  queryPermissions(
    request: RequestModel<PermissionFilter>,
  ): Promise<ResponseModel<Permission[]>>;
  createPermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>>;
  deletePermission(request: RequestModel<number>): Promise<ResponseModel<void>>;
  queryById(request: RequestModel<number>): Promise<ResponseModel<Permission>>;
  updatePermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>>;
}
