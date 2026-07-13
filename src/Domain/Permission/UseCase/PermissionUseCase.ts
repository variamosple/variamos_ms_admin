import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository";

export class PermissionUseCase {
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
