import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { User } from "./Entity/User.js";
import type { UserRegistration } from "./Entity/UserRegistration.js";

/**
 * An account as a password sign-in reads it: the user with its state, and
 * the hash of its password (null when it has none, as with Google).
 */
export interface PasswordAccount {
  user: User;
  passwordHash: string | null;
}

/** Sign-up and sign-in, with a password or with Google. */
export interface IUserSignInRepository {
  signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>>;
  userExists(request: RequestModel<string>): Promise<ResponseModel<boolean>>;
  /** Null for an unknown account. */
  findPasswordAccount(
    by: { email: string } | { id: string },
  ): Promise<PasswordAccount | null>;
  /**
   * Records a sign-in: the date, and the password hashed again when its
   * hash was made at another cost. Gives the user with roles and permissions.
   */
  recordSignIn(user: User, rehashedPassword?: string): Promise<User>;
  /** The user of a Google address with its state, created when unknown. */
  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>>;
  /** The account linked to this Google account, with its state; null if none. */
  findGoogleAccount(googleSub: string): Promise<User | null>;
  /** Links an account to its Google account; an existing link is kept. */
  linkGoogleIdentity(userId: string, googleSub: string): Promise<void>;
}
