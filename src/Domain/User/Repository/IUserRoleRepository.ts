import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { UserRole } from "../Entity/UserRole";
import { UserRoleFilter } from "../Entity/UserRoleFilter";

export interface IUserRoleRepository {
  queryUserRoles(request: RequestModel<UserRoleFilter>): Promise<ResponseModel<Role[]>>;
  queryUserRolesDetails(request: RequestModel<UserRoleFilter>): Promise<ResponseModel<Role[]>>;
  createUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<UserRole>>;
  deleteUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<void>>;
}
