import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "../Role/Entity/Role";
import { UserRole } from "./Entity/UserRole";
import { UserRoleFilter } from "./Entity/UserRoleFilter";
import { IUserRoleRepository } from "./Repository/IUserRoleRepository";

export class UserRoleUseCases {
  public constructor(private readonly userRoleRepository: IUserRoleRepository) {}

  public queryUserRoles(request: RequestModel<UserRoleFilter>): Promise<ResponseModel<Role[]>> {
    return this.userRoleRepository.queryUserRoles(request);
  }

  public queryUserRolesDetails(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    return this.userRoleRepository.queryUserRolesDetails(request);
  }

  public createUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<UserRole>> {
    return this.userRoleRepository.createUserRole(request);
  }

  public deleteUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<void>> {
    return this.userRoleRepository.deleteUserRole(request);
  }
}
