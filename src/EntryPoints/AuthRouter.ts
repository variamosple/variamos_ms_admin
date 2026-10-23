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
import logger from "jet-logger";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MFA_SIGN_IN_TTL_MS } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import type { SessionInfoResponse } from "#src/Domain/User/Entity/SessionInfoResponse.js";
import type { SingInResponse } from "#src/Domain/User/Entity/SingInResponse.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";

export const AUTH_ROUTE = "/auth";

/** Holds the opaque token of a sign-in waiting for the second factor. */
export const MFA_PENDING_COOKIE = "mfaPending";

/** Holds the token of a browser where the code is not asked (lot 6). */
export const MFA_TRUSTED_COOKIE = "mfaTrustedDevice";

export function createAuthRouter(
  userAuthUseCase: UserAuthUseCase,
  userPasswordUseCase: UserPasswordUseCase,
  userManagementUseCase: UserManagementUseCase,
  userQueryUseCase: UserQueryUseCase,
  mfaSignIn: MfaSignInUseCase,
): Router {
  const authRouter = Router();

  const HOME_URL = new URL(
    EnvVars.Auth.APP.HOME_REDIRECT_URI || "http://localhost:3000",
  );
  const HOME_URL_HOST_REGEX = new RegExp(`^${HOME_URL.hostname}$`);

  const isExternalDomain = (host?: string): boolean =>
    !!host && !HOME_URL_HOST_REGEX.test(host);

  const isAllowedOrigin = (origin: string): boolean => {
    if ("null" === origin) {
      return true;
    }

    return (
      EnvVars.CORS.AllowedOriginsPatterns.findIndex((pattern) =>
        pattern.test(origin),
      ) !== -1
    );
  };

  const getRedirectUrl = (
    transactionId: string,
    req: Request,
    res: Response,
    remove = true,
  ): URL | undefined => {
    const redirectUrl = req.cookies.redirectTo as string | undefined;

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

      return isAllowedOrigin(redirect.origin) ? redirect : undefined;
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
    const token = req.cookies?.[MFA_TRUSTED_COOKIE] as unknown;
    return typeof token === "string" ? token : undefined;
  };

  /** Creates the session cookie; gives the address to go to. */
  const openSession = async (
    transactionId: string,
    req: Request,
    res: Response,
    sessionUser: SessionUser,
  ): Promise<string> => {
    const redirect = getRedirectUrl(transactionId, req, res);

    const token = (await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain,
    )) as string;

    res.cookie("authToken", token, getCookieOptions());
    setRedirectAuthToken(redirect, token);

    return redirect
      ? redirect.toString()
      : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`;
  };

  authRouter.get("/session-info", async (req: Request, res) => {
    const response = new ResponseModel<SessionInfoResponse>("getSessionInfo");

    try {
      const authToken = getToken(req);
      const validationResponse = await validateToken(authToken);
      const user = validationResponse.data;

      if (validationResponse.errorCode) {
        return res
          .status(validationResponse.errorCode)
          .json(validationResponse);
      }
      if (!isSessionExpired(user?.exp)) {
        const redirect = getRedirectUrl("getSessionInfo", req, res);
        setRedirectAuthToken(redirect, authToken);

        return res.status(200).json(
          response.withResponse({
            user: sessionInfoToSessionUser(user) as SessionUser,
            redirect: redirect?.toString(),
          }),
        );
      }

      if (!user?.iat) {
        return res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            response.withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "Your session has expired, please log in again.",
            ),
          );
      }

      const currentDateInMs = Date.now();

      // Get max refresh time
      const refreshTimeInMs =
        user.iat * 1000 + EnvVars.CookieProps.Options.maxAge;

      if (currentDateInMs > refreshTimeInMs) {
        return res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            response.withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "Your session has expired, please log in again.",
            ),
          );
      }

      const isGuest =
        user.roles?.some((role: string) => role.toLowerCase() === "guest") ??
        false;

      const findSessionUserRequest = new RequestModel<string>(
        "getSessionInfo",
        user.sub,
      );

      let refreshedUser: ResponseModel<User>;

      if (isGuest) {
        refreshedUser = await userAuthUseCase.getGuestData(
          findSessionUserRequest,
        );
      } else {
        refreshedUser = await userQueryUseCase.sessionUser(
          findSessionUserRequest,
        );
      }

      if (refreshedUser.errorCode || !refreshedUser.data) {
        return res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            response.withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "Your session has expired, please log in again.",
            ),
          );
      }

      const {
        id,
        name,
        user: userName,
        email,
        roles,
        permissions,
      } = refreshedUser.data;

      const sessionUser: SessionUser = {
        id: id || "",
        name,
        email,
        user: userName,
        roles,
        permissions,
      };
      const token = (await createJwt(sessionUser, user.aud)) as string;

      const redirect = getRedirectUrl("getSessionInfo", req, res);
      setRedirectAuthToken(redirect, authToken);

      res
        .cookie("authToken", token, getCookieOptions())
        .status(200)
        .json(
          response.withResponse({
            user: sessionUser,
            authToken:
              isExternalDomain(user.aud) &&
              isExternalDomain(
                getUrl(response.transactionId || "", req.headers.origin)
                  ?.hostname,
              )
                ? token
                : undefined,
            redirect: redirect?.toString(),
          }),
        );
    } catch (error) {
      logger.err("Error verifying JWT:");
      logger.err(error as Error);
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
    const { email, password } = (req.body || {}) as Record<string, string>;

    try {
      if (!email || !password) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            response.withError(
              DomainErrorCodes.INVALID_INPUT,
              "Email and password are required.",
            ),
          );
      }

      const credentials = new Credentials(email, password);

      const request = new RequestModel<Credentials>(transactionId, credentials);
      const singInResponse = await userAuthUseCase.signIn(request);

      if (singInResponse.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(singInResponse.errorCode))
          .json(singInResponse);
      }

      if (!singInResponse.data) {
        return res
          .status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
          .json(singInResponse);
      }

      const {
        id,
        name,
        user: username,
        roles,
        permissions,
      } = singInResponse.data;

      const sessionUser: SessionUser = {
        id: id || "",
        name,
        email,
        user: username,
        roles,
        permissions,
      };

      // With a second factor, no session until the code is right
      const pendingToken = await mfaSignIn.begin(
        String(sessionUser.id),
        trustedDeviceToken(req),
      );
      if (pendingToken) {
        res.cookie(MFA_PENDING_COOKIE, pendingToken, mfaPendingCookieOptions());
        response.data = {
          mfaRequired: true,
          trustedDeviceDays: await mfaSignIn.trustedDeviceDays(),
        };
        return res.status(200).json(response);
      }

      response.data = {
        redirect: await openSession(transactionId, req, res, sessionUser),
      };

      res.status(200).json(response);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Sign in error. Please try again later.",
          ),
        );
    }
  });

  authRouter.post("/sign-in/mfa", async (req, res) => {
    const transactionId = "signInMfa";
    const response = new ResponseModel<SingInResponse>(transactionId);
    const pendingToken = req.cookies?.[MFA_PENDING_COOKIE] as
      | string
      | undefined;
    const { code, rememberDevice } = (req.body || {}) as Record<
      string,
      unknown
    >;
    const clearPending = () =>
      res.clearCookie(MFA_PENDING_COOKIE, getCookieOptions({ maxAge: false }));

    if (typeof code !== "string" || !code.trim() || code.length > 32) {
      return res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "The code is required.",
          ),
        );
    }

    try {
      const checked = await mfaSignIn.complete(
        transactionId,
        pendingToken ?? "",
        code,
      );
      if (checked.errorCode || !checked.data) {
        if (checked.errorCode !== DomainErrorCodes.INVALID_INPUT) {
          clearPending();
        }
        return res
          .status(mapDomainErrorToHttpStatus(checked.errorCode))
          .json(checked);
      }

      // Read again: the account may have been disabled since the password
      const found = await userQueryUseCase.sessionUser(
        new RequestModel<string>(transactionId, checked.data),
      );
      clearPending();
      if (found.errorCode || !found.data) {
        return res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            response.withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "Your sign-in has expired, please sign in again.",
            ),
          );
      }

      const {
        id,
        name,
        user: username,
        email,
        roles,
        permissions,
      } = found.data;
      if (rememberDevice === true) {
        const trusted = await mfaSignIn.trustDevice(checked.data);
        if (trusted) {
          res.cookie(
            MFA_TRUSTED_COOKIE,
            trusted.token,
            mfaTrustedCookieOptions(trusted.maxAgeMs),
          );
        }
      }
      response.data = {
        redirect: await openSession(transactionId, req, res, {
          id: id || "",
          name,
          email,
          user: username,
          roles,
          permissions,
        }),
      };
      res.status(200).json(response);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Sign in error. Please try again later.",
          ),
        );
    }
  });

  authRouter.post("/sign-up", async (req, res) => {
    const transactionId = "signUp";
    const { name, email, password, passwordConfirmation } = (req.body ||
      {}) as Record<string, string>;
    const successfulResponse = new ResponseModel<void>(
      transactionId,
      undefined,
      "You have successfully signed up!",
    );

    let registration: UserRegistration;
    try {
      registration = new UserRegistration(
        name,
        email,
        password,
        passwordConfirmation,
      );
    } catch (error) {
      return sendError(res, error, transactionId);
    }

    try {
      const request = new RequestModel<UserRegistration>(
        transactionId,
        registration,
      );
      const response = await userAuthUseCase.signUp(request);

      if (DomainErrorCodes.DUPLICATE_ENTITY === response.errorCode) {
        return res.status(HttpStatusCodes.OK).json(successfulResponse);
      }

      if (response.errorCode) {
        return res
          .status(
            mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes),
          )
          .json(response);
      }

      res.status(HttpStatusCodes.OK).json(successfulResponse);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Sign in error. Please try again later.",
          ),
        );
    }
  });

  authRouter.post("/logout", (_, res) => {
    const cookieOptions = getCookieOptions({
      maxAge: false,
    });

    res.clearCookie("authToken", cookieOptions);
    res.status(200).json(new ResponseModel<void>("logout"));
  });

  const validateGoogleCode = async (
    token: string,
  ): Promise<User | undefined> => {
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

      const name = payload.name;
      const email = payload.email;

      const user: User = User.builder()
        .setUser(name || "")
        .setName(name || "")
        .setEmail(email || "")
        .build();

      return user;
    } catch (err) {
      logger.err(err as Error);
      throw new Error("Error when validating Google's user data.");
    }
  };

  authRouter.post("/google/callback", async (req, res) => {
    const transactionId = "loginWithGoogle";
    const { credential } = (req.body || {}) as Record<string, string>;
    try {
      const user = await validateGoogleCode(credential);

      const request = new RequestModel<User>(transactionId, user);
      const response = await userAuthUseCase.findOrCreate(request);

      // The login page shows the message of a reason code, never a text
      // read from its address (T-16)
      if (response.errorCode) {
        const reason =
          response.errorCode === DomainErrorCodes.FORBIDDEN
            ? "account-inactive"
            : "sign-in-failed";
        return res.redirect(
          302,
          `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=${reason}`,
        );
      }

      if (!response.data) {
        return res.redirect(
          302,
          `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=sign-in-failed`,
        );
      }

      const {
        id,
        name,
        user: username,
        email,
        roles,
        permissions,
      } = response.data;

      const sessionUser: SessionUser = {
        id: id || "",
        name,
        email,
        user: username,
        roles,
        permissions,
      };

      const pendingToken = await mfaSignIn.begin(
        String(sessionUser.id),
        trustedDeviceToken(req),
      );
      if (pendingToken) {
        res.cookie(MFA_PENDING_COOKIE, pendingToken, mfaPendingCookieOptions());
        const days = await mfaSignIn.trustedDeviceDays();
        return res.redirect(
          302,
          `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?mfa=required&trustedDeviceDays=${days}`,
        );
      }

      const redirect = getRedirectUrl(transactionId, req, res, false);
      const token = (await createJwt(
        sessionUser,
        redirect?.hostname || EnvVars.CookieProps.Options.domain,
      )) as string;

      res.cookie("authToken", token, getCookieOptions());

      res.redirect(302, `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`);
    } catch (err) {
      logger.err(describeError(err));
      res.redirect(
        302,
        `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=sign-in-failed`,
      );
    }
  });

  authRouter.get(
    "/my-account",
    hasPermissions(["my-account::query"]),
    async (req, res) => {
      const transactionId = "myAccount";
      const user = req.user as SessionUser;
      try {
        const request = new RequestModel<string>(transactionId, user.id);

        const response = await userQueryUseCase.myAccount(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        logger.err(describeError(error));
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(500).json(response);
      }
    },
  );

  authRouter.put(
    "/my-account/information",
    hasPermissions(["my-account::update"]),
    async (req, res) => {
      const transactionId = "updateMyAccountInformation";
      const user = req.user as SessionUser;
      const personalInformation = (req.body || {}) as {
        countryCode?: string | null;
      };

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

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        logger.err(describeError(error));
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(500).json(response);
      }
    },
  );

  authRouter.put(
    "/password-update",
    hasPermissions(["my-account::update"]),
    async (req, res) => {
      const transactionId = "passwordUpdate";
      const user = req.user as SessionUser;
      const { currentPassword, newPassword, passwordConfirmation } =
        (req.body || {}) as Record<string, string>;
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

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        logger.err(describeError(error));
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(500).json(response);
      }
    },
  );

  authRouter.post("/guest/sign-in", async (req, res) => {
    const transactionId = "signInAsGuest";
    const { guestId } = (req.body || {}) as Record<string, string>;

    try {
      const response = new ResponseModel<SingInResponse>(transactionId);
      const request = new RequestModel<string>(transactionId, guestId);
      const guestResponse = await userAuthUseCase.getGuestData(request);

      if (guestResponse.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(guestResponse.errorCode))
          .json(guestResponse);
      }

      if (!guestResponse.data) {
        return res
          .status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
          .json(guestResponse);
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
      const token = (await createJwt(
        sessionUser,
        redirect?.hostname || EnvVars.CookieProps.Options.domain,
      )) as string;

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
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Sign in error. Please try again later.",
          ),
        );
    }
  });

  authRouter.post("/redirects", (request, res) => {
    const response = new ResponseModel<void>("setRedirect");
    const { url } = (request.body || {}) as Record<string, string>;

    if (!url) {
      res.status(200).json(response);
      return;
    }

    let isAllowed = false;

    try {
      const redirect = new URL(url);
      isAllowed = isAllowedOrigin(redirect.origin);
    } catch (error) {
      logger.err(`POST: ${AUTH_ROUTE}/redirects Invalid redirect URL:`);
      logger.err(error as Error);
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
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>("getPasswordPolicy").withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Password policy error.",
          ),
        );
    }
  });

  authRouter.post("/forgot-password", async (req, res) => {
    const transactionId = "forgotPassword";
    const { email = "" } = (req.body || {}) as Record<string, string>;

    try {
      const forgotPasswordResponse = await userPasswordUseCase.requestReset(
        new RequestModel<string>(transactionId, email),
      );

      if (forgotPasswordResponse.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(forgotPasswordResponse.errorCode))
          .json(forgotPasswordResponse);
      }

      res.status(200).json(forgotPasswordResponse);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Forgot password error. Please try again later.",
          ),
        );
    }
  });

  // POST keeps the token out of URLs and access logs; GET stays while
  // clients that still send the token in the query string are replaced.
  const verifyToken = async (token: unknown, res: Response) => {
    const transactionId = "verifyToken";

    try {
      const verifyResponse = await userPasswordUseCase.verifyToken(
        new RequestModel<string>(
          transactionId,
          typeof token === "string" ? token : "",
        ),
      );

      if (verifyResponse.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(verifyResponse.errorCode))
          .json(verifyResponse);
      }

      res.status(200).json(verifyResponse);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Token verification error.",
          ),
        );
    }
  };

  authRouter.post("/verify-token", (req, res) =>
    verifyToken((req.body as { token?: unknown } | undefined)?.token, res),
  );
  authRouter.get("/verify-token", (req, res) =>
    verifyToken(req.query?.token, res),
  );

  authRouter.post("/reset-password", async (req, res) => {
    const transactionId = "resetPassword";
    const { token = "", password = "" } = (req.body || {}) as Record<
      string,
      string
    >;

    try {
      const resetResponse = await userPasswordUseCase.resetPassword(
        new RequestModel<{ token: string; password: string }>(transactionId, {
          token,
          password,
        }),
      );

      if (resetResponse.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(resetResponse.errorCode))
          .json(resetResponse);
      }

      res.status(200).json(resetResponse);
    } catch (err) {
      logger.err(describeError(err));
      res
        .status(500)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Reset password error. Please try again later.",
          ),
        );
    }
  });

  return authRouter;
}
