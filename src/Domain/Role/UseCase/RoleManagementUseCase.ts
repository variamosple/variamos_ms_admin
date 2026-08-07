import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "@src/Domain/Role/Entity/Role.js";
import type { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository.js";

export class RoleManagementUseCase {
  public constructor(private readonly roleRepository: IRoleRepository) {}

  public createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return this.roleRepository.createRole(request);
  }

  public deleteRole(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    return this.roleRepository.deleteRole(request);
  }

  public updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return this.roleRepository.updateRole(request);
  }
}
