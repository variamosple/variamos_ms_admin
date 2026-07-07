import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "./Entity/Role";
import { RoleFilter } from "./Entity/RoleFilter";
import { IRoleRepository } from "./Repository/IRoleRepository";

export class RolesUseCases {
  public constructor(private readonly roleRepository: IRoleRepository) {}

  public queryRoles(request: RequestModel<RoleFilter>): Promise<ResponseModel<Role[]>> {
    return this.roleRepository.queryRoles(request);
  }

  public createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return this.roleRepository.createRole(request);
  }

  public deleteRole(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.roleRepository.deleteRole(request);
  }

  public queryById(request: RequestModel<string>): Promise<ResponseModel<Role>> {
    return this.roleRepository.queryById(request);
  }

  public updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return this.roleRepository.updateRole(request);
  }
}
