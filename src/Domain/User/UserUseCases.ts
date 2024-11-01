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

  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.findSessionUser(request);
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

  queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.queryById(request);
  }

  disableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.disableUser(request);
  }

  enableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.enableUser(request);
  }

  deleteUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.deleteUser(request);
  }
}
