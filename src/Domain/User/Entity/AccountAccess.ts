import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

/**
 * Whether an account may open a session (EV-98, CA-BE-04). The rule was
 * written again in each repository read of an account; it is now written
 * here once, and applied to the state the repositories read.
 */
export interface AccountState {
  isEnabled?: boolean | null;
  isDeleted?: boolean | null;
}

export type AccountRefusal = "disabled" | "deleted";

export const ACCOUNT_REFUSAL_MESSAGES: Readonly<
  Record<AccountRefusal, string>
> = {
  disabled: "Your account is disabled.",
  deleted: "Your account is deleted.",
};

/**
 * Why this account may not open a session, or null when it may. An account
 * whose state is unknown is not enabled: it is refused.
 */
export const accountRefusalOf = (
  state: AccountState,
): AccountRefusal | null => {
  if (!state.isEnabled) return "disabled";
  if (state.isDeleted) return "deleted";
  return null;
};

/**
 * Whether a password may open this account: it must have one, and be open.
 * The answer is the same for a missing account, so that nothing tells them
 * apart.
 */
export const canUsePassword = <A extends PasswordState>(
  account: A | null,
): account is A & { passwordHash: string } =>
  account !== null &&
  Boolean(account.passwordHash) &&
  accountRefusalOf(account.user) === null;

interface PasswordState {
  user: AccountState;
  passwordHash: string | null;
}

/**
 * The response of a user read, or the refusal of an account that may no
 * longer hold a session, under the error code of the caller.
 */
export const refuseClosedAccount = <U extends AccountState>(
  response: ResponseModel<U>,
  code: DomainErrorCodes,
): ResponseModel<U> => {
  const refusal = response.data ? accountRefusalOf(response.data) : null;
  return refusal
    ? new ResponseModel<U>(response.transactionId).withError(
        code,
        ACCOUNT_REFUSAL_MESSAGES[refusal],
      )
    : response;
};
