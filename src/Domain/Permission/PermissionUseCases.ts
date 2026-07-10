import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "./Entity/Permission";
import { PermissionFilter } from "./Entity/PermissionFilter";
import { IPermissionRepository } from "./Repository/IPermissionRepository";

export class PermissionsUseCases {
  public constructor(private readonly permissionRepository: IPermissionRepository) {}

  public queryPermissions(
    request: RequestModel<PermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    return this.permissionRepository.queryPermissions(request);
  }

  public createPermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.createPermission(request);
  }

  public deletePermission(request: RequestModel<number>): Promise<ResponseModel<void>> {
    return this.permissionRepository.deletePermission(request);
  }

  public queryById(request: RequestModel<number>): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.queryById(request);
  }

  public updatePermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.updatePermission(request);
  }
}
