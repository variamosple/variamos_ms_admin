import type { SessionUser } from "@variamosple/variamos-security";
import type { Request, Response } from "express";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { recordAccess } from "./accessJournal.js";
import type { AuthWeb, AuthWebSettings } from "./authWeb.js";

export const AUTH_ROUTE = "/auth";

/** What the authentication routes use. */
export interface AuthRouterDependencies {
  userAuthUseCase: UserAuthUseCase;
  userPasswordUseCase: UserPasswordUseCase;
  userManagementUseCase: UserManagementUseCase;
  userQueryUseCase: UserQueryUseCase;
  mfaSignIn: MfaSignInUseCase;
  accessJournal: IAccessJournal;
  /** Cookie options and pages of VariaMosAdmin, read once at start. */
  web: AuthWebSettings;
}

/** What every authentication route is given. */
export type AuthContext = AuthRouterDependencies & AuthWeb;

/** The session of an account, as its token carries it. */
export const sessionUserOf = (
  account: User,
  email = account.email,
): SessionUser => ({
  id: account.id || "",
  name: account.name,
  email,
  user: account.user,
  roles: account.roles,
  permissions: account.permissions,
});

/**
 * Records the password or Google step of a sign-in. A sign-in waiting for
 * its code is not complete: the browser is named only once it is.
 */
export const recordSignInStep = (
  ctx: AuthContext,
  req: Request,
  res: Response,
  step: {
    event: "sign-in" | "sign-in.google";
    userId: string;
    pendingToken: string | null;
  },
): void => {
  const { event, userId, pendingToken } = step;
  recordAccess(
    ctx.accessJournal,
    req,
    res,
    pendingToken
      ? { event, outcome: "success", reason: "mfa_required", userId }
      : {
          event,
          outcome: "success",
          reason: null,
          userId,
          deviceId: ctx.knownDevice(req, res),
        },
  );
};
