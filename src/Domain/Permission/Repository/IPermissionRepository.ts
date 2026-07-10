import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "../Entity/Permission";
import { PermissionFilter } from "../Entity/PermissionFilter";

export interface IPermissionRepository {
  queryPermissions(request: RequestModel<PermissionFilter>): Promise<ResponseModel<Permission[]>>;
  createPermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>>;
  deletePermission(request: RequestModel<number>): Promise<ResponseModel<void>>;
  queryById(request: RequestModel<number>): Promise<ResponseModel<Permission>>;
  updatePermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>>;
}
