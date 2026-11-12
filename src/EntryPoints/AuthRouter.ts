import {
  createJwt,
  getToken,
  hasPermissions,
  isSessionExpired,
  type SessionUser,
  sessionInfoToSessionUser,
  validateToken,
} from "@variamosple/variamos-security";
import {
  type CookieOptions,
  type Request,
  type Response,
  Router,
} from "express";
import { OAuth2Client } from "google-auth-library";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import logger from "#src/common/logger.js";
import type { KnownAccount } from "#src/Domain/Activity/AccessEntry.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MFA_SIGN_IN_TTL_MS } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import {
  GOOGLE_SIGN_IN_REFUSALS,
  type GoogleProfile,
  isVerifiedClaim,
} from "#src/Domain/User/Entity/GoogleIdentity.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import type { SingInResponse } from "#src/Domain/User/Entity/SingInResponse.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { recordAccess } from "./accessJournal.js";
import { signedInUser } from "./actor.js";
import {
  forgotPasswordBody,
  googleCallbackBody,
  guestSignInBody,
  passwordUpdateBody,
  personalInformationBody,
  redirectBody,
  resetPasswordBody,
  signInBody,
  signInMfaBody,
  signUpBody,
  verifyTokenBody,
} from "./authRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { queryText } from "./queryText.js";
import { readBody } from "./requestBody.js";

/** Why a sign-in failed, as the access journal records it. */
const signInFailureReason = (
  errorCode: DomainErrorCodes,
  account: KnownAccount | null,
) => {
  if (errorCode === DomainErrorCodes.SYSTEM_ERROR) return "system_error";
  return account && !account.active
    ? "account_inactive"
    : "invalid_credentials";
};

// A code as typed: some text, at most 32 characters
const isCodeShaped = (code: unknown): code is string =>
  typeof code === "string" && code.trim() !== "" && code.length <= 32;

/** The session of an account, as its token carries it. */
const sessionUserOf = (account: User, email = account.email): SessionUser => ({
  id: account.id || "",
  name: account.name,
  email,
  user: account.user,
  roles: account.roles,
  permissions: account.permissions,
});

/** Body of GET /auth/session-info: an HTTP shape, not a domain entity. */
interface SessionInfoResponse {
  user: SessionUser | null;
  authToken?: string;
  redirect?: string;
}

export const AUTH_ROUTE = "/auth";

/** Holds the opaque token of a sign-in waiting for the second factor. */
export const MFA_PENDING_COOKIE = "mfaPending";

/** Holds the token of a browser where the code is not asked (lot 6). */
export const MFA_TRUSTED_COOKIE = "mfaTrustedDevice";

// Reason of a refused second factor, from the code of the answer
const MFA_FAILURES: Record<string, string> = {
  [DomainErrorCodes.INVALID_INPUT]: "wrong_code",
  [DomainErrorCodes.TOO_MANY_REQUESTS]: "too_many_attempts",
  [DomainErrorCodes.UNAUTHORIZED_ACCESS]: "expired",
  [DomainErrorCodes.UNAVAILABLE]: "unavailable",
};

/**
 * The host a session token was issued for. Its audience is that host, or,
 * for a token issued between #183 and its revert, the list
 * ["variamos-platform", host].
 */
export const audienceHostOf = (aud: unknown): string | undefined => {
  const entries = Array.isArray(aud) ? aud : [aud];
  return entries.find(
    (entry): entry is string =>
      typeof entry === "string" && entry !== "variamos-platform",
  );
};

/** What the authentication routes use. */
export interface AuthRouterDependencies {
  userAuthUseCase: UserAuthUseCase;
  userPasswordUseCase: UserPasswordUseCase;
  userManagementUseCase: UserManagementUseCase;
  userQueryUseCase: UserQueryUseCase;
  mfaSignIn: MfaSignInUseCase;
  accessJournal: IAccessJournal;
}

/**
 * Whether the g_csrf_token cookie Google sets on our domain matches the one
 * it posts with the credential (redirect mode of Sign In With Google).
 */
export const hasMatchingGoogleCsrfToken = (
  req: Request,
  bodyToken: string | undefined,
): boolean => {
  const cookieToken: unknown = req.cookies?.g_csrf_token;
  return (
    typeof cookieToken === "string" &&
    cookieToken !== "" &&
    cookieToken === bodyToken
  );
};

export function createAuthRouter(dependencies: AuthRouterDependencies): Router {
  const {
    userAuthUseCase,
    userPasswordUseCase,
    userManagementUseCase,
    userQueryUseCase,
    mfaSignIn,
    accessJournal,
  } = dependencies;
  const authRouter = Router();

  const HOME_URL = new URL(
    EnvVars.Auth.APP.HOME_REDIRECT_URI || "http://localhost:3000",
  );
  const HOME_URL_HOST_REGEX = new RegExp(`^${HOME_URL.hostname}$`);

  const isExternalDomain = (host?: string): boolean =>
    host !== undefined && host !== "" && !HOME_URL_HOST_REGEX.test(host);

  const isAllowedOrigin = (origin: string): boolean =>
    EnvVars.CORS.AllowedOriginsPatterns.some((pattern) => pattern.test(origin));

  // A page to go back to after sign-in: a web address of an allowed site.
  // A javascript: or data: address has the origin "null"; given to the
  // browser, a javascript: one would run its script on the sign-in site.
  const isAllowedRedirect = (redirect: URL): boolean =>
    (redirect.protocol === "http:" || redirect.protocol === "https:") &&
    isAllowedOrigin(redirect.origin);

  const getRedirectUrl = (
    transactionId: string,
    req: Request,
    res: Response,
    remove = true,
  ): URL | undefined => {
    const redirectUrl = queryText(req.cookies.redirectTo);

    if (!redirectUrl) {
      return undefined;
    }

    if (remove) {
      res.clearCookie(
        "redirectTo",
        getCookieOptions({ sameSite: "none", maxAge: false }),
      );
    }

    return getUrl(transactionId, redirectUrl);
  };

  const getUrl = (transactionId: string, url?: string): URL | undefined => {
    if (!url) {
      return undefined;
    }

    try {
      const redirect = new URL(url);

      return isAllowedRedirect(redirect) ? redirect : undefined;
    } catch (error) {
      // The query string or fragment may carry a token: never log them
      const urlWithoutQuery = url.split(/[?#]/)[0]?.slice(0, 200);
      logger.err(`${transactionId} Invalid URL: ${urlWithoutQuery}`);
      logger.err(describeError(error));
    }

    return undefined;
  };

  interface CookieOptionsInput {
    domain?: string;
    httpOnly?: boolean;
    sameSite?: "strict" | "lax" | "none";
    maxAge?: boolean;
  }

  const getCookieOptions = (
    options: CookieOptionsInput = {},
  ): CookieOptions => {
    const domain = options.domain ?? EnvVars.CookieProps.Options.domain;
    const httpOnly = options.httpOnly ?? EnvVars.CookieProps.Options.httpOnly;
    const sameSite = options.sameSite ?? "strict";
    const maxAge = options.maxAge ?? true;

    const cookieOptions: CookieOptions = {
      domain,
      path: EnvVars.CookieProps.Options.path,
      sameSite,
      httpOnly,
      secure: sameSite === "none" ? true : EnvVars.CookieProps.Options.secure,
      maxAge: maxAge ? EnvVars.CookieProps.Options.maxAge : undefined,
    };

    return cookieOptions;
  };

  const setRedirectAuthToken = (url: Nullable<URL>, token: string) => {
    if (url && isExternalDomain(url.hostname)) {
      url.searchParams.set("authToken", token);
    }
  };

  const mfaPendingCookieOptions = (): CookieOptions => ({
    ...getCookieOptions({ maxAge: false }),
    maxAge: MFA_SIGN_IN_TTL_MS,
  });

  // Google posts its callback from its own site: only SameSite=None comes
  // back with it. The token alone opens nothing, it only spares the code
  // after a right password or Google credential.
  const mfaTrustedCookieOptions = (maxAgeMs: number): CookieOptions => ({
    ...getCookieOptions({ sameSite: "none", maxAge: false }),
    maxAge: maxAgeMs,
  });

  const trustedDeviceToken = (req: Request): string | undefined => {
    return queryText(req.cookies?.[MFA_TRUSTED_COOKIE]);
  };

  /** Creates the session cookie; gives the address to go to. */
  const openSession = async (
    transactionId: string,
    req: Request,
    res: Response,
    sessionUser: SessionUser,
  ): Promise<string> => {
    const redirect = getRedirectUrl(transactionId, req, res);

    const token = await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain,
    );

    res.cookie("authToken", token, getCookieOptions());
    setRedirectAuthToken(redirect, token);

    return redirect
      ? redirect.toString()
      : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`;
  };

  // The answer to a session that cannot be refreshed: sign in again
  const sessionExpired = (
    res: Response,
    response: ResponseModel<SessionInfoResponse>,
  ) => {
    res
      .status(HttpStatusCodes.UNAUTHORIZED)
      .json(
        response.withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          "Your session has expired, please log in again.",
        ),
      );
  };

  /** The account of a session read again; null when it is gone or closed. */
  const reloadSessionUser = async (
    sub: string | undefined,
    tokenRoles: string[] | undefined,
  ): Promise<SessionUser | null> => {
    const isGuest =
      tokenRoles?.some((role: string) => role.toLowerCase() === "guest") ??
      false;
    const request = new RequestModel<string>("getSessionInfo", sub);
    const refreshedUser = isGuest
      ? await userAuthUseCase.getGuestData(request)
      : await userQueryUseCase.sessionUser(request);
    if (refreshedUser.errorCode || !refreshedUser.data) return null;
    return sessionUserOf(refreshedUser.data);
  };

  authRouter.get("/session-info", async (req: Request, res) => {
    const response = new ResponseModel<SessionInfoResponse>("getSessionInfo");

    try {
      const authToken = getToken(req);
      const validationResponse = await validateToken(authToken);
      const user = validationResponse.data;

      if (validationResponse.errorCode) {
        res.status(validationResponse.errorCode).json(validationResponse);
        return;
      }
      if (!isSessionExpired(user?.exp)) {
        const redirect = getRedirectUrl("getSessionInfo", req, res);
        setRedirectAuthToken(redirect, authToken);

        res.status(200).json(
          response.withResponse({
            user: sessionInfoToSessionUser(user),
            redirect: redirect?.toString(),
          }),
        );
        return;
      }

      // An expired token is refreshed until the cookie's own age
      if (
        !user?.iat ||
        Date.now() > user.iat * 1000 + EnvVars.CookieProps.Options.maxAge
      ) {
        sessionExpired(res, response);
        return;
      }

      const sessionUser = await reloadSessionUser(user.sub, user.roles);
      if (!sessionUser) {
        sessionExpired(res, response);
        return;
      }
      // A token issued between #183 and its revert holds the audience
      // ["variamos-platform", host], which vms_projects (Python
      // variamos-security 0.0.2) cannot read: the refreshed token holds the
      // host alone again
      const host = audienceHostOf(user.aud);
      const token = await createJwt(sessionUser, host);

      // The page to go back to receives the refreshed token, not the
      // expired one it replaces
      const redirect = getRedirectUrl("getSessionInfo", req, res);
      setRedirectAuthToken(redirect, token);

      // The token is given to a page of another site only
      const origin = getUrl(response.transactionId || "", req.headers.origin);
      const shared =
        isExternalDomain(host) && isExternalDomain(origin?.hostname);
      res
        .cookie("authToken", token, getCookieOptions())
        .status(200)
        .json(
          response.withResponse({
            user: sessionUser,
            authToken: shared ? token : undefined,
            redirect: redirect?.toString(),
          }),
        );
    } catch (error) {
      logger.err("Error verifying JWT:");
      logger.err(error);
      res
        .status(HttpStatusCodes.UNAUTHORIZED)
        .json(
          response.withError(
            DomainErrorCodes.UNAUTHORIZED_ACCESS,
            "Session validation error",
          ),
        );
    }
  });

  authRouter.post("/sign-in", async (req, res) => {
    const transactionId = "signIn";
    const response = new ResponseModel<SingInResponse>(transactionId);
    const body = readBody(signInBody, req, res, transactionId);
    if (!body) return;
    const { email, password } = body;

    try {
      if (!email || !password) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            response.withError(
              DomainErrorCodes.INVALID_INPUT,
              "Email and password are required.",
            ),
          );
        return;
      }

      const credentials = new Credentials(email, password);

      const request = new RequestModel<Credentials>(transactionId, credentials);
      const singInResponse = await userAuthUseCase.signIn(request);

      if (singInResponse.errorCode) {
        // The account is named when it exists; the typed e-mail never is
        const account = await accessJournal.accountByEmail(email);
        recordAccess(accessJournal, req, res, {
          event: "sign-in",
          outcome: "failed",
          reason: signInFailureReason(singInResponse.errorCode, account),
          userId: account?.id,
        });
        res
          .status(mapDomainErrorToHttpStatus(singInResponse.errorCode))
          .json(singInResponse);
        return;
      }

      if (!singInResponse.data) {
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(singInResponse);
        return;
      }

      // The address typed at sign-in, as before
      const sessionUser = sessionUserOf(singInResponse.data, email);

      // With a second factor, no session until the code is right
      const pendingToken = await mfaSignIn.begin(
        sessionUser.id,
        trustedDeviceToken(req),
      );
      recordAccess(accessJournal, req, res, {
        event: "sign-in",
        outcome: "success",
        reason: pendingToken ? "mfa_required" : null,
        userId: sessionUser.id,
      });
      if (pendingToken) {
        res.cookie(MFA_PENDING_COOKIE, pendingToken, mfaPendingCookieOptions());
        response.data = {
          mfaRequired: true,
          trustedDeviceDays: await mfaSignIn.trustedDeviceDays(),
        };
        res.status(200).json(response);
        return;
      }

      response.data = {
        redirect: await openSession(transactionId, req, res, sessionUser),
      };

      res.status(200).json(response);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  // A wrong code keeps the pending sign-in; any other failure ends it
  const refuseMfaCode = (
    req: Request,
    res: Response,
    checked: ResponseModel<string>,
    pendingUserId: string | null,
  ) => {
    recordAccess(accessJournal, req, res, {
      event: "sign-in.mfa",
      outcome: "failed",
      reason: MFA_FAILURES[String(checked.errorCode)] ?? "failed",
      userId: pendingUserId,
    });
    if (checked.errorCode !== DomainErrorCodes.INVALID_INPUT) {
      res.clearCookie(MFA_PENDING_COOKIE, getCookieOptions({ maxAge: false }));
    }
    res.status(mapDomainErrorToHttpStatus(checked.errorCode)).json(checked);
  };

  // A trusted device skips the code for some days
  const trustDevice = async (res: Response, userId: string) => {
    const trusted = await mfaSignIn.trustDevice(userId);
    if (trusted) {
      res.cookie(
        MFA_TRUSTED_COOKIE,
        trusted.token,
        mfaTrustedCookieOptions(trusted.maxAgeMs),
      );
    }
  };

  /**
   * Opens the session once the code is right, or refuses an account closed
   * since the password was typed.
   */
  const finishMfaSignIn = async (
    req: Request,
    res: Response,
    signIn: { userId: string; account?: User | null; rememberDevice: boolean },
  ) => {
    const transactionId = "signInMfa";
    const response = new ResponseModel<SingInResponse>(transactionId);
    const { userId, account, rememberDevice } = signIn;
    if (!account) {
      recordAccess(accessJournal, req, res, {
        event: "sign-in.mfa",
        outcome: "failed",
        reason: "account_inactive",
        userId,
      });
      res
        .status(HttpStatusCodes.UNAUTHORIZED)
        .json(
          response.withError(
            DomainErrorCodes.UNAUTHORIZED_ACCESS,
            "Your sign-in has expired, please sign in again.",
          ),
        );
      return;
    }
    recordAccess(accessJournal, req, res, {
      event: "sign-in.mfa",
      outcome: "success",
      reason: null,
      userId,
    });
    if (rememberDevice) await trustDevice(res, userId);
    response.data = {
      redirect: await openSession(
        transactionId,
        req,
        res,
        sessionUserOf(account),
      ),
    };
    res.status(200).json(response);
  };

  authRouter.post("/sign-in/mfa", async (req, res) => {
    const transactionId = "signInMfa";
    const response = new ResponseModel<SingInResponse>(transactionId);
    const pendingToken = queryText(req.cookies?.[MFA_PENDING_COOKIE]);
    const body = readBody(signInMfaBody, req, res, transactionId);
    if (!body) return;
    const { code, rememberDevice } = body;
    const clearPending = () =>
      res.clearCookie(MFA_PENDING_COOKIE, getCookieOptions({ maxAge: false }));

    if (!isCodeShaped(code)) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "The code is required.",
          ),
        );
      return;
    }

    try {
      // Read before the check, which may end the pending sign-in
      const pendingUserId = pendingToken
        ? mfaSignIn.pendingUser(pendingToken)
        : null;
      const checked = await mfaSignIn.complete(
        transactionId,
        pendingToken ?? "",
        code,
      );
      if (checked.errorCode || !checked.data) {
        refuseMfaCode(req, res, checked, pendingUserId);
        return;
      }

      // Read again: the account may have been disabled since the password
      const found = await userQueryUseCase.sessionUser(
        new RequestModel<string>(transactionId, checked.data),
      );
      clearPending();
      await finishMfaSignIn(req, res, {
        userId: checked.data,
        account: found.errorCode ? undefined : found.data,
        rememberDevice: rememberDevice === true,
      });
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  authRouter.post("/sign-up", async (req, res) => {
    const transactionId = "signUp";
    const body = readBody(signUpBody, req, res, transactionId);
    if (!body) return;
    const { name, email, password, passwordConfirmation } = body;
    const successfulResponse = new ResponseModel<void>(transactionId, {
      message: "You have successfully signed up!",
    });

    try {
      // Checked once, by the use case; a taken address answers as a free one
      const response = await userAuthUseCase.signUp(
        new RequestModel(transactionId, {
          name,
          email,
          password,
          passwordConfirmation,
        }),
      );

      if (response.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(response.errorCode))
          .json(response);
        return;
      }

      res.status(HttpStatusCodes.OK).json(successfulResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  authRouter.post("/logout", (_, res) => {
    const cookieOptions = getCookieOptions({
      maxAge: false,
    });

    res.clearCookie("authToken", cookieOptions);
    res.status(200).json(new ResponseModel<void>("logout"));
  });

  const validateGoogleCode = async (token: string): Promise<GoogleProfile> => {
    try {
      const client = new OAuth2Client(EnvVars.Auth.GOOGLE.CLIENT_ID);

      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: EnvVars.Auth.GOOGLE.CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new Error("Invalid JWT token format.");
      }

      return {
        sub: payload.sub,
        email: payload.email || "",
        name: payload.name || "",
        emailVerified: isVerifiedClaim(payload.email_verified),
        hostedDomain: payload.hd || undefined,
      };
    } catch (err) {
      logger.err(err);
      throw new Error("Error when validating Google's user data.", {
        cause: err,
      });
    }
  };

  /**
   * A refused Google sign-in, recorded with its reason; the login page
   * shows the message of a reason code, never a text read from its address
   * (T-16).
   */
  const refuseGoogleSignIn = async (
    req: Request,
    res: Response,
    response: ResponseModel<User>,
    email: string | undefined,
  ) => {
    const inactive = response.errorCode === DomainErrorCodes.FORBIDDEN;
    const refusal = GOOGLE_SIGN_IN_REFUSALS.find(
      (code) => code === response.message,
    );
    const account = email ? await accessJournal.accountByEmail(email) : null;
    recordAccess(accessJournal, req, res, {
      event: "sign-in.google",
      outcome: "failed",
      reason: inactive ? "account_inactive" : (refusal ?? "sign_in_failed"),
      userId: account?.id,
    });
    const reason = inactive ? "account-inactive" : "sign-in-failed";
    res.redirect(
      302,
      `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=${reason}`,
    );
  };

  // An error after the checks: recorded once, back to the login page
  const failGoogleSignIn = (req: Request, res: Response) => {
    if (!res.locals.accessRecorded) {
      recordAccess(accessJournal, req, res, {
        event: "sign-in.google",
        outcome: "failed",
        reason: "sign_in_failed",
      });
    }
    res.redirect(
      302,
      `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=sign-in-failed`,
    );
  };

  // The login page asks the code of the second factor
  const askGoogleMfaCode = async (res: Response, pendingToken: string) => {
    res.cookie(MFA_PENDING_COOKIE, pendingToken, mfaPendingCookieOptions());
    const days = await mfaSignIn.trustedDeviceDays();
    res.redirect(
      302,
      `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?mfa=required&trustedDeviceDays=${days}`,
    );
  };

  authRouter.post("/google/callback", async (req, res) => {
    const transactionId = "loginWithGoogle";
    const body = readBody(googleCallbackBody, req, res, transactionId);
    if (!body) return;
    const { credential } = body;
    // Google posts the same random value in a cookie of our domain and in
    // the body; only a page of ours can set the cookie. Logged only until
    // production shows that the cookie arrives (EV-70 lot 5).
    if (!hasMatchingGoogleCsrfToken(req, body.g_csrf_token)) {
      logger.warn(
        "POST /auth/google/callback: g_csrf_token missing or not matching (not enforced yet)",
      );
    }
    try {
      const profile = await validateGoogleCode(credential);

      const request = new RequestModel<GoogleProfile>(transactionId, profile);
      const response = await userAuthUseCase.signInWithGoogle(request);

      // The login page shows the message of a reason code, never a text
      // read from its address (T-16)
      if (response.errorCode) {
        await refuseGoogleSignIn(req, res, response, profile.email);
        return;
      }

      if (!response.data) {
        recordAccess(accessJournal, req, res, {
          event: "sign-in.google",
          outcome: "failed",
          reason: "sign_in_failed",
        });
        res.redirect(
          302,
          `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=sign-in-failed`,
        );
        return;
      }

      const sessionUser = sessionUserOf(response.data);

      const pendingToken = await mfaSignIn.begin(
        sessionUser.id,
        trustedDeviceToken(req),
      );
      recordAccess(accessJournal, req, res, {
        event: "sign-in.google",
        outcome: "success",
        reason: pendingToken ? "mfa_required" : null,
        userId: sessionUser.id,
      });
      if (pendingToken) {
        await askGoogleMfaCode(res, pendingToken);
        return;
      }

      const redirect = getRedirectUrl(transactionId, req, res, false);
      const token = await createJwt(
        sessionUser,
        redirect?.hostname || EnvVars.CookieProps.Options.domain,
      );

      res.cookie("authToken", token, getCookieOptions());

      res.redirect(302, `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`);
    } catch (err) {
      logger.err(describeError(err));
      failGoogleSignIn(req, res);
    }
  });

  authRouter.get(
    "/my-account",
    hasPermissions(["my-account::query"]),
    async (req, res) => {
      const transactionId = "myAccount";
      const user = signedInUser(req);
      try {
        const request = new RequestModel<string>(transactionId, user.id);

        const response = await userQueryUseCase.myAccount(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  authRouter.put(
    "/my-account/information",
    hasPermissions(["my-account::update"]),
    async (req, res) => {
      const transactionId = "updateMyAccountInformation";
      const user = signedInUser(req);
      const personalInformation = readBody(
        personalInformationBody,
        req,
        res,
        transactionId,
      );
      if (!personalInformation) return;

      try {
        const personalInformationUpdate = PersonalInformationUpdate.builder()
          .setUserId(user.id)
          .setCountryCode(personalInformation.countryCode)
          .build();

        const request = new RequestModel<PersonalInformationUpdate>(
          transactionId,
          personalInformationUpdate,
        );

        const response = await userManagementUseCase.updateProfile(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  authRouter.put(
    "/password-update",
    hasPermissions(["my-account::update"]),
    async (req, res) => {
      const transactionId = "passwordUpdate";
      const user = signedInUser(req);
      const body = readBody(passwordUpdateBody, req, res, transactionId);
      if (!body) return;
      const { currentPassword, newPassword, passwordConfirmation } = body;
      try {
        const passwordUpdate = PasswordUpdate.builder()
          .setId(user.id)
          .setCurrentPassword(currentPassword)
          .setNewPassword(newPassword)
          .setPasswordConfirmation(passwordConfirmation)
          .build();

        const response = await userManagementUseCase.updatePassword(
          new RequestModel(transactionId, passwordUpdate),
        );

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  authRouter.post("/guest/sign-in", async (req, res) => {
    const transactionId = "signInAsGuest";
    const body = readBody(guestSignInBody, req, res, transactionId);
    if (!body) return;
    const { guestId } = body;

    try {
      const response = new ResponseModel<SingInResponse>(transactionId);
      const request = new RequestModel<string>(transactionId, guestId);
      const guestResponse = await userAuthUseCase.getGuestData(request);

      if (guestResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(guestResponse.errorCode))
          .json(guestResponse);
        return;
      }

      if (!guestResponse.data) {
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(guestResponse);
        return;
      }

      const { id, name, user, email, roles, permissions } = guestResponse.data;

      const sessionUser: SessionUser = {
        id: id || "",
        name,
        email,
        user,
        roles,
        permissions,
      };

      const redirect = getRedirectUrl(transactionId, req, res);
      const token = await createJwt(
        sessionUser,
        redirect?.hostname || EnvVars.CookieProps.Options.domain,
      );

      res.cookie("authToken", token, getCookieOptions());
      setRedirectAuthToken(redirect, token);

      response.data = {
        id: id || "",
        redirect: redirect
          ? redirect.toString()
          : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`,
      };

      res.status(200).json(response);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  authRouter.post("/redirects", (request, res) => {
    const response = new ResponseModel<void>("setRedirect");
    const body = readBody(redirectBody, request, res, "setRedirect");
    if (!body) return;
    const { url } = body;

    if (!url) {
      res.status(200).json(response);
      return;
    }

    let isAllowed = false;

    try {
      const redirect = new URL(url);
      isAllowed = isAllowedRedirect(redirect);
    } catch (error) {
      logger.err(`POST: ${AUTH_ROUTE}/redirects Invalid redirect URL:`);
      logger.err(error);
      logger.err(describeError(error));
    }

    if (isAllowed) {
      res.cookie("redirectTo", url, getCookieOptions({ sameSite: "none" }));
    }

    res.status(200).json(response);
  });

  // Public: the sign-up and reset forms check the same rule as the server
  authRouter.get("/password-policy", async (_req, res) => {
    try {
      res.status(200).json(await userPasswordUseCase.getPasswordPolicy());
    } catch (err) {
      sendError(res, err, "getPasswordPolicy");
    }
  });

  authRouter.post("/forgot-password", async (req, res) => {
    const transactionId = "forgotPassword";
    const body = readBody(forgotPasswordBody, req, res, transactionId);
    if (!body) return;
    const { email } = body;

    try {
      const forgotPasswordResponse = await userPasswordUseCase.requestReset(
        new RequestModel<string>(transactionId, email),
      );

      if (forgotPasswordResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(forgotPasswordResponse.errorCode))
          .json(forgotPasswordResponse);
        return;
      }

      res.status(200).json(forgotPasswordResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  // The token travels in the body, out of URLs and access logs (EV-74)
  authRouter.post("/verify-token", async (req, res) => {
    const transactionId = "verifyToken";
    const body = readBody(verifyTokenBody, req, res, transactionId);
    if (!body) return;

    try {
      const verifyResponse = await userPasswordUseCase.verifyToken(
        new RequestModel<string>(transactionId, body.token),
      );

      if (verifyResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(verifyResponse.errorCode))
          .json(verifyResponse);
        return;
      }

      res.status(200).json(verifyResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  authRouter.post("/reset-password", async (req, res) => {
    const transactionId = "resetPassword";
    const body = readBody(resetPasswordBody, req, res, transactionId);
    if (!body) return;
    const { token, password } = body;

    try {
      const resetResponse = await userPasswordUseCase.resetPassword(
        new RequestModel<{ token: string; password: string }>(transactionId, {
          token,
          password,
        }),
      );

      if (resetResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(resetResponse.errorCode))
          .json(resetResponse);
        return;
      }

      res.status(200).json(resetResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  });

  return authRouter;
}
