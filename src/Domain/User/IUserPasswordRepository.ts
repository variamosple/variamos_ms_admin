import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { PasswordUpdate } from "./Entity/PasswordUpdate.js";

export type PasswordResetOutcome =
  | "reset"
  | "invalid_token"
  | "inactive_account"
  | "same_password";

/** Passwords: changed by their owner, or reset with a single-use token. */
export interface IUserPasswordRepository {
  updateUserPassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>>;
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
