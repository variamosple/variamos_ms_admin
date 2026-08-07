import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { Credentials } from "./Entity/Credentials.js";
import type { PasswordUpdate } from "./Entity/PasswordUpdate.js";
import type { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate.js";
import type { User } from "./Entity/User.js";
import type { UserFilter } from "./Entity/UserFilter.js";
import type { UserRegistration } from "./Entity/UserRegistration.js";

export interface IUserRepository {
  queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>>;
  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>>;
  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>>;
  signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>>;
  signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<User>>;
  disableUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  enableUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  deleteUser(request: RequestModel<string>): Promise<ResponseModel<void>>;
  updateUserPassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>>;
  updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>>;
  userExists(request: RequestModel<string>): Promise<ResponseModel<boolean>>;
  getUserByEmail(email: string): Promise<User | null>;
  savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: Date;
    usedAt?: Date | null;
  } | null>;
  resetPasswordAndUpdateToken(
    userId: string,
    passwordHash: string,
    tokenHash: string,
  ): Promise<void>;
}
