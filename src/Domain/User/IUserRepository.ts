import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { Credentials } from "./Entity/Credentials";
import { UserRegistration } from "./Entity/UserRegistration";
import { PasswordUpdate } from "./Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate";

export interface IUserRepository {
  queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>>;
  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>>;
  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>>;
  signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>>;
  signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>>;
  queryById(request: RequestModel<string>): Promise<ResponseModel<User>>;
  disableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>>;
  enableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>>;
  deleteUser(request: RequestModel<string>): Promise<ResponseModel<unknown>>;
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
