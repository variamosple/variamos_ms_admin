import type { SessionUser } from "@variamosple/variamos-security";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import type { AuthWeb } from "./authWeb.js";

export const AUTH_ROUTE = "/auth";

/** What the authentication routes use. */
export interface AuthRouterDependencies {
  userAuthUseCase: UserAuthUseCase;
  userPasswordUseCase: UserPasswordUseCase;
  userManagementUseCase: UserManagementUseCase;
  userQueryUseCase: UserQueryUseCase;
  mfaSignIn: MfaSignInUseCase;
  accessJournal: IAccessJournal;
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
