import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { User } from "@src/Domain/User/Entity/User";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";

export class UserQueryUseCase {
  public constructor(private readonly userRepository: IUserRepository) {}

  public async queryList(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>> {
    return this.userRepository.queryUsers(request);
  }

  public async queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.queryById(request);
  }

  public async sessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.findSessionUser(request);
  }

  public async myAccount(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userRepository.queryById(request).then((response) => {
      if (response.data) {
        response.data = User.builder()
          .setId(response.data.id)
          .setName(response.data.name)
          .setEmail(response.data.email)
          .setUser(response.data.user)
          .setCountryCode(response.data.countryCode)
          .setCountryName(response.data.countryName)
          .build();
      }
      return response;
    });
  }
}
