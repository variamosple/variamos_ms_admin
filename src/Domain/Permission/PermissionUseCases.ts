import { PermissionRepositoryInstance } from "@src/DataProviders/Permission/PermissionRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "./Entity/Permission";
import { PermissionFilter } from "./Entity/PermissionFilter";

export class PermissionsUseCases {
  queryPermissions(
    request: RequestModel<PermissionFilter>
  ): Promise<ResponseModel<Permission[]>> {
    return PermissionRepositoryInstance.queryPermissions(request);
  }
}
