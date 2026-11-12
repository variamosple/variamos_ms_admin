import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate.js";
import type { User } from "./Entity/User.js";
import type { UserFilter } from "./Entity/UserFilter.js";

/** The accounts: lists, reading, state and personal information. */
export interface IUserRepository {
  queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>>;
  /**
   * The user with its state, roles and permissions. Whether the account may
   * still hold a session is decided by the domain (AccountAccess).
   */
  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<User>>;
  disableUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  enableUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  deleteUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>>;
  getUserByEmail(email: string): Promise<User | null>;
}
