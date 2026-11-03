import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { PasswordUpdate } from "./Entity/PasswordUpdate.js";
import type { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate.js";
import type { User } from "./Entity/User.js";
import type { UserFilter } from "./Entity/UserFilter.js";
import type { UserRegistration } from "./Entity/UserRegistration.js";

export type PasswordResetOutcome =
  | "reset"
  | "invalid_token"
  | "inactive_account"
  | "same_password";

/**
 * An account as a password sign-in reads it: the user with its state, and
 * the hash of its password (null when it has none, as with Google).
 */
export interface PasswordAccount {
  user: User;
  passwordHash: string | null;
}

export interface IUserRepository {
  queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>>;
  /**
   * The user with its state, roles and permissions. Whether the account may
   * still hold a session is decided by the domain (AccountAccess).
   */
  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>>;
  /** The user of a Google address with its state, created when unknown. */
  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>>;
  /** Null for an unknown account. */
  findPasswordAccount(
    by: { email: string } | { id: string },
  ): Promise<PasswordAccount | null>;
  /**
   * Records a sign-in: the date, and the password hashed again when its
   * hash was made at another cost. Gives the user with roles and permissions.
   */
  recordSignIn(user: User, rehashedPassword?: string): Promise<User>;
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
    /** The account exists, is enabled and is not deleted. */
    isUserActive: boolean;
  } | null>;
  /**
   * Consumes the token and sets the password in one transaction. The token is
   * consumed only if it is unused and not expired, so two concurrent requests
   * with the same token cannot both succeed.
   */
  resetPasswordWithToken(
    tokenHash: string,
    passwordPlain: string,
  ): Promise<PasswordResetOutcome>;
}
