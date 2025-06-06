import EnvVars from "@src/common/EnvVars";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { PasswordUpdate } from "@src/Domain/User/Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "@src/Domain/User/Entity/PersonalInformationUpdate";
import { SessionInfoResponse } from "@src/Domain/User/Entity/SessionInfoResponse";
import { SingInResponse } from "@src/Domain/User/Entity/SingInResponse";
import { User } from "@src/Domain/User/Entity/User";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import {
  createJwt,
  getToken,
  hasPermissions,
  isSessionExpired,
  sessionInfoToSessionUser,
  SessionUser,
  validateToken,
} from "@variamosple/variamos-security";
import { CookieOptions, Request, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import logger from "jet-logger";

export const AUTH_ROUTE = "/auth";

const authRouter = Router();

const HOME_URL = new URL(EnvVars.Auth.APP.HOME_REDIRECT_URI!);
const HOME_URL_HOST_REGEX = new RegExp(`^${HOME_URL.hostname}$`);

const isExternalDomain = (host?: string): boolean =>
  !!host && HOME_URL_HOST_REGEX.test(host);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin || "null" === origin) {
    return true;
  }

  return (
    EnvVars.CORS.AllowedOriginsPatterns.findIndex((pattern) =>
      pattern.test(origin)
    ) !== -1
  );
};

const getRedirectUrl = (
  transactionId: string,
  req: Request,
  res: Response,
  remove: boolean = true
): URL | undefined => {
  const redirectUrl = req.cookies.redirectTo;

  if (!redirectUrl) {
    return undefined;
  }

  if (remove) {
    res.clearCookie(
      "redirectTo",
      getCookieOptions({ sameSite: "none", maxAge: false })
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
    logger.err(`${transactionId} Invalid URL: ${url}`);
    logger.err(error, true);
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
  {
    domain = EnvVars.CookieProps.Options.domain,
    httpOnly = EnvVars.CookieProps.Options.httpOnly,
    sameSite = "strict",
    maxAge = true,
  }: CookieOptionsInput = {
    domain: EnvVars.CookieProps.Options.domain,
    httpOnly: EnvVars.CookieProps.Options.httpOnly,
    sameSite: "strict",
    maxAge: true,
  }
): CookieOptions => {
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

authRouter.get("/session-info", async (req: Request, res) => {
  const response = new ResponseModel<SessionInfoResponse>("getSessionInfo");

  try {
    const authToken = getToken(req);
    const validationResponse = await validateToken(authToken);
    const user = validationResponse.data;

    if (validationResponse.errorCode) {
      return res.status(validationResponse.errorCode).json(validationResponse);
    } else if (!isSessionExpired(user?.exp)) {
      const redirect = getRedirectUrl("getSessionInfo", req, res);
      setRedirectAuthToken(redirect, authToken);

      return res.status(200).json(
        response.withResponse({
          user: sessionInfoToSessionUser(user)!,
          redirect: redirect?.toString?.(),
        })
      );
    }

    if (!user?.iat) {
      return res
        .status(HttpStatusCodes.UNAUTHORIZED)
        .json(
          response.withError(
            HttpStatusCodes.UNAUTHORIZED,
            "Your session has expired, please log in again."
          )
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
            HttpStatusCodes.UNAUTHORIZED,
            "Your session has expired, please log in again."
          )
        );
    }

    const userRoles = user.roles || [];

    const isGuest = userRoles.find(
      (role: string) => role.toLowerCase() === "guest"
    );

    const findeSessionUserRequest = new RequestModel<string>(
      "getSessionInfo",
      user.sub
    );

    let refreshedUser: ResponseModel<User>;

    if (isGuest) {
      refreshedUser = await new UsersUseCases().getGuestData(
        findeSessionUserRequest
      );
    } else {
      refreshedUser = await new UsersUseCases().findSessionUser(
        findeSessionUserRequest
      );
    }

    if (!!refreshedUser.errorCode || !refreshedUser.data) {
      return res
        .status(HttpStatusCodes.UNAUTHORIZED)
        .json(
          response.withError(
            HttpStatusCodes.UNAUTHORIZED,
            "Your session has expired, please log in again."
          )
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
      id: id!,
      name,
      email,
      user: userName,
      roles,
      permissions,
    };
    const token = await createJwt(sessionUser, user.aud);

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
              getUrl(response.transactionId!, req.headers.origin)?.hostname
            )
              ? token
              : undefined,
          redirect: redirect?.toString?.(),
        })
      );
  } catch (error) {
    console.error("Error verifying JWT:", error);
    res
      .status(HttpStatusCodes.UNAUTHORIZED)
      .json(
        response.withError(
          HttpStatusCodes.UNAUTHORIZED,
          "Session validation error"
        )
      );
  }
});

authRouter.post("/sign-in", async (req, res) => {
  const transactionId = "signIn";
  const response = new ResponseModel<SingInResponse>(transactionId);
  const { email, password } = req.body || {};

  try {
    if (!email || !password) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          response.withError(
            HttpStatusCodes.BAD_REQUEST,
            "Email and password are required."
          )
        );
    }

    const credentials = new Credentials(email, password);

    const request = new RequestModel<Credentials>(transactionId, credentials);
    const singInResponse = await new UsersUseCases().signIn(request);

    if (singInResponse.errorCode) {
      return res
        .status(
          singInResponse.errorCode || HttpStatusCodes.INTERNAL_SERVER_ERROR
        )
        .json(singInResponse);
    }

    const {
      id,
      name,
      user: username,
      roles,
      permissions,
    } = singInResponse.data!;

    const sessionUser: SessionUser = {
      id: id!,
      name,
      email,
      user: username,
      roles,
      permissions,
    };

    const redirect = getRedirectUrl(transactionId, req, res);

    const token = await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain
    );

    res.cookie("authToken", token, getCookieOptions());
    setRedirectAuthToken(redirect, token);

    response.data = {
      redirect: redirect
        ? redirect.toString()
        : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`,
    };

    res.status(200).json(response);
  } catch (err) {
    logger.err(err, true);
    res
      .status(500)
      .json(
        new ResponseModel<unknown>(transactionId).withError(
          HttpStatusCodes.INTERNAL_SERVER_ERROR,
          "Sign in error. Please try again later."
        )
      );
  }
});

authRouter.post("/sign-up", async (req, res) => {
  const transactionId = "signUp";
  const { name, email, password, passwordConfirmation } = req.body || {};
  const successfullResponse = new ResponseModel<unknown>(
    transactionId,
    undefined,
    "You have successfully signed up!"
  );

  try {
    const registration = new UserRegistration(
      name,
      email,
      password,
      passwordConfirmation
    );

    const request = new RequestModel<UserRegistration>(
      transactionId,
      registration
    );
    const response = await new UsersUseCases().signUp(request);

    if (HttpStatusCodes.CONFLICT.valueOf() === response.errorCode) {
      return res.status(HttpStatusCodes.OK).json(successfullResponse);
    }

    if (response.errorCode) {
      return res
        .status(response.errorCode || HttpStatusCodes.INTERNAL_SERVER_ERROR)
        .json(response);
    }

    res.status(HttpStatusCodes.OK).json(successfullResponse);
  } catch (err) {
    logger.err(err, true);
    res
      .status(500)
      .json(
        new ResponseModel<unknown>(transactionId).withError(
          HttpStatusCodes.INTERNAL_SERVER_ERROR,
          "Sign in error. Please try again later."
        )
      );
  }
});

authRouter.post("/logout", async (_, res) => {
  const cookieOptions = getCookieOptions({
    maxAge: false,
  });

  res.clearCookie("authToken", cookieOptions);
  res.status(200).json(new ResponseModel<void>("logout"));
});

const validateGoogleCode = async (token: string): Promise<User | undefined> => {
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

    const name = payload?.name;
    const email = payload?.email;

    const user: User = User.builder()
      .setUser(name!)
      .setName(name!)
      .setEmail(email!)
      .build();

    return user;
  } catch (err) {
    console.error(err);
    throw new Error("Error when validating Google's user data.");
  }
};

authRouter.post("/google/callback", async (req, res) => {
  const transactionId = "loginWithGoogle";
  const { credential } = req.body || {};
  try {
    const user = await validateGoogleCode(credential);

    const request = new RequestModel<User>(transactionId, user);
    const response = await new UsersUseCases().findOrCreateUser(request);

    if (response.errorCode) {
      return res.redirect(
        302,
        `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?errorMessage=${response.message}`
      );
    }

    const {
      id,
      name,
      user: username,
      email,
      roles,
      permissions,
    } = response.data! || {};

    const sessionUser: SessionUser = {
      id: id!,
      name,
      email,
      user: username,
      roles,
      permissions,
    };

    const redirect = getRedirectUrl(transactionId, req, res, false);
    const token = await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain
    );

    res.cookie("authToken", token, getCookieOptions());

    res.redirect(302, `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`);
  } catch (err) {
    logger.err(err, true);
    res.redirect(
      302,
      `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?errorMessage=Login error.`
    );
  }
});

authRouter.get(
  "/my-account",
  hasPermissions(["my-account::query"]),
  async (req, res) => {
    const transactionId = "myAccount";
    const user = req.user!;
    try {
      const request = new RequestModel<string>(transactionId, user.id);

      const response = await new UsersUseCases().getMyAccount(request);

      const status = response.errorCode || 200;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error, true);
      const response = new ResponseModel(
        transactionId,
        500,
        "Internal Server Error"
      );
      res.status(500).json(response);
    }
  }
);

authRouter.put(
  "/my-account/information",
  hasPermissions(["my-account::update"]),
  async (req, res) => {
    const transactionId = "updateMyAccountInformation";
    const user = req.user!;
    const personalInformation = req.body!;

    try {
      const personalInformationUpdate = PersonalInformationUpdate.builder()
        .setUserId(user.id)
        .setCountryCode(personalInformation?.countryCode)
        .build();

      const request = new RequestModel<PersonalInformationUpdate>(
        transactionId,
        personalInformationUpdate
      );

      const response = await new UsersUseCases().updatePersonalInformation(
        request
      );

      const status = response.errorCode || 200;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error, true);
      const response = new ResponseModel(
        transactionId,
        500,
        "Internal Server Error"
      );
      res.status(500).json(response);
    }
  }
);

authRouter.put(
  "/password-update",
  hasPermissions(["my-account::update"]),
  async (req, res) => {
    const transactionId = "passwordUpdate";
    const user = req.user!;
    const { currentPassword, newPassword, passwordConfirmation } =
      req.body || {};
    try {
      const passwordUpdate = PasswordUpdate.builder()
        .setId(user.id)
        .setCurrentPassword(currentPassword)
        .setNewPassword(newPassword)
        .setPasswordConfirmation(passwordConfirmation)
        .build();

      const response = await new UsersUseCases().updatePassword(
        new RequestModel(transactionId, passwordUpdate)
      );

      const status = response.errorCode || 200;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error, true);
      const response = new ResponseModel(
        transactionId,
        500,
        "Internal Server Error"
      );
      res.status(500).json(response);
    }
  }
);

authRouter.post("/guest/sign-in", async (req, res) => {
  const transactionId = "signInAsGuest";
  const { guestId = null } = req.body || {};

  try {
    const response = new ResponseModel<SingInResponse>(transactionId);
    const request = new RequestModel<string>(transactionId, guestId);
    const guestResponse = await new UsersUseCases().getGuestData(request);

    if (guestResponse.errorCode) {
      return res
        .status(
          guestResponse.errorCode || HttpStatusCodes.INTERNAL_SERVER_ERROR
        )
        .json(guestResponse);
    }

    const { id, name, user, email, roles, permissions } = guestResponse.data!;

    const sessionUser: SessionUser = {
      id: id!,
      name,
      email,
      user,
      roles,
      permissions,
    };

    const redirect = getRedirectUrl(transactionId, req, res);
    const token = await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain
    );

    res.cookie("authToken", token, getCookieOptions());
    setRedirectAuthToken(redirect, token);

    response.data = {
      id: id!,
      redirect: redirect
        ? redirect.toString()
        : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`,
    };

    res.status(200).json(response);
  } catch (err) {
    logger.err(err, true);
    res
      .status(500)
      .json(
        new ResponseModel<unknown>(transactionId).withError(
          HttpStatusCodes.INTERNAL_SERVER_ERROR,
          "Sign in error. Please try again later."
        )
      );
  }
});

authRouter.post("/redirects", async (request, res) => {
  const response = new ResponseModel<void>("setRedirect");
  const { url } = request.body || {};

  if (!url) {
    res.status(200).json(response);
    return;
  }

  let isAllowed = false;

  try {
    const redirect = new URL(url);
    isAllowed = isAllowedOrigin(redirect.origin);
  } catch (error) {
    logger.err(`POST: ${AUTH_ROUTE}/redirects Invalid redirect URL: `, error);
    logger.err(error, true);
  }

  if (isAllowed) {
    res.cookie("redirectTo", url, getCookieOptions({ sameSite: "none" }));
  }

  res.status(200).json(response);
});

export default authRouter;
