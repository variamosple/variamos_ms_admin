import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";

export class UsersUseCases {
  queryUsers(
    request: RequestModel<UserFilter>
  ): Promise<ResponseModel<User[]>> {
    return UserRepositoryInstance.queryUsers(request);
  }

  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.findOrCreateUser(request);
  }
}
