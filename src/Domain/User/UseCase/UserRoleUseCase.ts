import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { UserRole } from "../Entity/UserRole";
import { UserRoleFilter } from "../Entity/UserRoleFilter";
import { IUserRoleRepository } from "../Repository/IUserRoleRepository";

export class UserRoleUseCase {
  public constructor(private readonly userRoleRepository: IUserRoleRepository) {}

  public async queryUserRoles(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    return this.userRoleRepository.queryUserRoles(request);
  }

  public async queryUserRolesDetails(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    return this.userRoleRepository.queryUserRolesDetails(request);
  }

  public async createUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<UserRole>> {
    return this.userRoleRepository.createUserRole(request);
  }

  public async deleteUserRole(request: RequestModel<UserRole>): Promise<ResponseModel<void>> {
    return this.userRoleRepository.deleteUserRole(request);
  }
}
