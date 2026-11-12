import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { refuseClosedAccount } from "#src/Domain/User/Entity/AccountAccess.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserFilter } from "#src/Domain/User/Entity/UserFilter.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";

export class UserQueryUseCase {
  public constructor(private readonly userRepository: IUserRepository) {}

  public async queryList(
    request: RequestModel<UserFilter>,
  ): Promise<ResponseModel<User[]>> {
    return await this.userRepository.queryUsers(request);
  }

  public async queryById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    return await this.userRepository.queryById(request);
  }

  /** The user of a session, refused once its account is closed. */
  public async sessionUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    return refuseClosedAccount(
      await this.userRepository.findSessionUser(request),
      DomainErrorCodes.INVALID_INPUT,
    );
  }

  public async myAccount(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    return await this.userRepository.queryById(request).then((response) => {
      if (response.data) {
        response.data = User.builder()
          .setId(response.data.id)
          .setName(response.data.name)
          .setEmail(response.data.email)
          .setUser(response.data.user)
          .setCountryCode(response.data.countryCode)
          .setCountryName(response.data.countryName)
          .setIsEnabled(response.data.isEnabled)
          .setIsDeleted(response.data.isDeleted)
          .setCreatedAt(response.data.createdAt)
          .setLastLogin(response.data.lastLogin)
          .build();
      }
      return response;
    });
  }
}
