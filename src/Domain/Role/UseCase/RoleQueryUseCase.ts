import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository";

export class RoleQueryUseCase {
  public constructor(private readonly roleRepository: IRoleRepository) {}

  public queryRoles(request: RequestModel<RoleFilter>): Promise<ResponseModel<Role[]>> {
    return this.roleRepository.queryRoles(request);
  }

  public queryById(request: RequestModel<string>): Promise<ResponseModel<Role>> {
    return this.roleRepository.queryById(request);
  }
}
