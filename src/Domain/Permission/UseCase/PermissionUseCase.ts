import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import type { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter.js";
import type { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository.js";

export class PermissionUseCase {
  public constructor(
    private readonly permissionRepository: IPermissionRepository,
  ) {}

  public queryPermissions(
    request: RequestModel<PermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    return this.permissionRepository.queryPermissions(request);
  }

  public createPermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.createPermission(request);
  }

  public deletePermission(
    request: RequestModel<number>,
  ): Promise<ResponseModel<void>> {
    return this.permissionRepository.deletePermission(request);
  }

  public queryById(
    request: RequestModel<number>,
  ): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.queryById(request);
  }

  public updatePermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.updatePermission(request);
  }
}
