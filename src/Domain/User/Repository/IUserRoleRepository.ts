import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "@src/Domain/Role/Entity/Role.js";
import type { UserRole } from "../Entity/UserRole.js";
import type { UserRoleFilter } from "../Entity/UserRoleFilter.js";

export interface IUserRoleRepository {
  queryUserRoles(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>>;
  queryUserRolesDetails(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>>;
  createUserRole(
    request: RequestModel<UserRole>,
  ): Promise<ResponseModel<UserRole>>;
  deleteUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<void>>;
}
