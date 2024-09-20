import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Credentials } from "./Entity/Credentials";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { UserRegistration } from "./Entity/UserRegistration";

export class UsersUseCases {
  queryUsers(
    request: RequestModel<UserFilter>
  ): Promise<ResponseModel<User[]>> {
    return UserRepositoryInstance.queryUsers(request);
  }

  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.findOrCreateUser(request);
  }

  signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.signIn(request);
  }

  signUp(
    request: RequestModel<UserRegistration>
  ): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.signUp(request);
  }
}
