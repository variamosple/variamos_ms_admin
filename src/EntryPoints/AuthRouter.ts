import EnvVars from "@src/common/EnvVars";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { PasswordUpdate } from "@src/Domain/User/Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "@src/Domain/User/Entity/PersonalInformationUpdate";
import { User } from "@src/Domain/User/Entity/User";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import {
  createJwt,
  isAuthenticated,
  isSessionExpired,
  sessionInfoToSessionUser,
  SessionUser,
  validateToken,
} from "@variamos/variamos-security";
import { CookieOptions, Request, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import logger from "jet-logger";

export const AUTH_ROUTE = "/auth";

const authRouter = Router();

const cookieOptions: CookieOptions = {
  domain: EnvVars.CookieProps.Options.domain,
  path: EnvVars.CookieProps.Options.path,
  sameSite: "strict",
  httpOnly: EnvVars.CookieProps.Options.httpOnly,
  secure: EnvVars.CookieProps.Options.secure,
  maxAge: EnvVars.CookieProps.Options.maxAge,
};

authRouter.get("/session-info", async (req: Request, res) => {
  const response = new ResponseModel<SessionUser>("getSessionInfo");

  try {
    const validationResponse = await validateToken(req.cookies.authToken);
    const user = validationResponse.data;

    if (validationResponse.errorCode) {
      return res.status(validationResponse.errorCode).json(validationResponse);
    } else if (!isSessionExpired(user?.exp)) {
      return res
        .status(200)
        .json(response.withResponse(sessionInfoToSessionUser(user)));
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
    const token = await createJwt(sessionUser);

    res
      .cookie("authToken", token, cookieOptions)
      .status(200)
      .json(response.withResponse(sessionUser));
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
  const { email, password } = req.body || {};

  try {
    if (!email || !password) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "Email and password are required."
          )
        );
    }

    const credentials = new Credentials(email, password);

    const request = new RequestModel<Credentials>(transactionId, credentials);
    const response = await new UsersUseCases().signIn(request);

    if (response.errorCode) {
      return res
        .status(response.errorCode || HttpStatusCodes.INTERNAL_SERVER_ERROR)
        .json(response);
    }

    const { id, name, user: username, roles, permissions } = response.data!;

    const sessionUser: SessionUser = {
      id: id!,
      name,
      email,
      user: username,
      roles,
      permissions,
    };
    const token = await createJwt(sessionUser);

    res.cookie("authToken", token, cookieOptions);

    response.data = undefined;
    res.status(200).json(response);
  } catch (err) {
    logger.err(err);
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
    logger.err(err);
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
  res.clearCookie("authToken", cookieOptions);
  res.sendStatus(200);
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
    const token = await createJwt(sessionUser);

    res.cookie("authToken", token, cookieOptions);
    res.redirect(302, `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`);
  } catch (err) {
    logger.err(err);
    res.redirect(
      302,
      `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?errorMessage=Login error.`
    );
  }
});

authRouter.get("/my-account", isAuthenticated, async (req, res) => {
  const transactionId = "myAccount";
  const user = req.user!;
  try {
    const request = new RequestModel<string>(transactionId, user.id);

    const response = await new UsersUseCases().getMyAccount(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

authRouter.put("/my-account/information", isAuthenticated, async (req, res) => {
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
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

authRouter.put("/password-update", isAuthenticated, async (req, res) => {
  const transactionId = "passwordUpdate";
  const user = req.user!;
  const { currentPassword, newPassword, passwordConfirmation } = req.body || {};
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
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

authRouter.post("/guest/sign-in", async (req, res) => {
  const transactionId = "signInAsGuest";
  const { guestId = null } = req.body || {};

  try {
    const response = new ResponseModel<string>(transactionId);
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
    const token = await createJwt(sessionUser);

    res.cookie("authToken", token, cookieOptions);

    response.data = id;
    res.status(200).json(response);
  } catch (err) {
    logger.err(err);
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

export default authRouter;
