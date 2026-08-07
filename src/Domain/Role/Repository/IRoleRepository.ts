import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "../Entity/Role.js";
import type { RoleFilter } from "../Entity/RoleFilter.js";

export interface IRoleRepository {
  queryRoles(request: RequestModel<RoleFilter>): Promise<ResponseModel<Role[]>>;
  createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>>;
  deleteRole(request: RequestModel<string>): Promise<ResponseModel<void>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<Role>>;
  updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>>;
}
