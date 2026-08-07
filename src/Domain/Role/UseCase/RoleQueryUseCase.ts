import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "@src/Domain/Role/Entity/Role.js";
import type { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter.js";
import type { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository.js";

export class RoleQueryUseCase {
  public constructor(private readonly roleRepository: IRoleRepository) {}

  public queryRoles(
    request: RequestModel<RoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    return this.roleRepository.queryRoles(request);
  }

  public queryById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Role>> {
    return this.roleRepository.queryById(request);
  }
}
