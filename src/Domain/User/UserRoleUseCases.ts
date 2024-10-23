import { UserRoleRepositoryInstance } from "@src/DataProviders/User/UserRoleRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "../Role/Entity/Role";
import { UserRole } from "./Entity/UserRole";
import { UserRoleFilter } from "./Entity/UserRoleFilter";

export class UserRoleUseCases {
  queryUserRoles(
    request: RequestModel<UserRoleFilter>
  ): Promise<ResponseModel<Role[]>> {
    return UserRoleRepositoryInstance.queryUserRoles(request);
  }

  createUserRole(
    request: RequestModel<UserRole>
  ): Promise<ResponseModel<UserRole>> {
    return UserRoleRepositoryInstance.createUserRole(request);
  }

  deleteUserRole(
    request: RequestModel<UserRole>
  ): Promise<ResponseModel<void>> {
    return UserRoleRepositoryInstance.deleteUserRole(request);
  }
}
