import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "@src/Domain/Role/Entity/Role.js";
import type { UserRole } from "../Entity/UserRole.js";
import type { UserRoleFilter } from "../Entity/UserRoleFilter.js";
import type { IUserRoleRepository } from "../Repository/IUserRoleRepository.js";

export class UserRoleUseCase {
  public constructor(
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

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

  public async createUserRole(
    request: RequestModel<UserRole>,
  ): Promise<ResponseModel<UserRole>> {
    return this.userRoleRepository.createUserRole(request);
  }

  public async deleteUserRole(
    request: RequestModel<UserRole>,
  ): Promise<ResponseModel<void>> {
    return this.userRoleRepository.deleteUserRole(request);
  }
}
