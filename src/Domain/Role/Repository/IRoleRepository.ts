import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "../Entity/Role";
import { RoleFilter } from "../Entity/RoleFilter";

export interface IRoleRepository {
  queryRoles(request: RequestModel<RoleFilter>): Promise<ResponseModel<Role[]>>;
  createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>>;
  deleteRole(request: RequestModel<string>): Promise<ResponseModel<void>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<Role>>;
  updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>>;
}
