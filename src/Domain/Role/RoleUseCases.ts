import { RoleRepositoryInstance } from "@src/DataProviders/Role/RoleRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "./Entity/Role";
import { RoleFilter } from "./Entity/RoleFilter";

export class RolesUseCases {
  queryRoles(
    request: RequestModel<RoleFilter>
  ): Promise<ResponseModel<Role[]>> {
    return RoleRepositoryInstance.queryRoles(request);
  }

  createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return RoleRepositoryInstance.createRole(request);
  }
}
