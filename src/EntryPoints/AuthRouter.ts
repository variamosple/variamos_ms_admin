import EnvVars from "@src/common/EnvVars";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { User } from "@src/Domain/User/Entity/User";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import {
  createJwt,
  isAuthenticated,
  SessionUser,
} from "@variamos/variamos-security";
import { Request, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import logger from "jet-logger";

export const AUTH_ROUTE = "/auth";

const authRouter = Router();

authRouter.get("/session-info", isAuthenticated, async (req: Request, res) => {
  const user = req.user;

  return res.status(200).json(user);
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

    const { id, name, user: username } = response.data!;

    const sessionUser: SessionUser = { id: id!, name, email, user: username };
    const token = await createJwt(sessionUser);

    res.cookie("authToken", token, { httpOnly: true, secure: true });

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
  const { name, email, password } = req.body || {};
  const successfullResponse = new ResponseModel<unknown>(
    transactionId,
    undefined,
    "You have successfully signed up!"
  );

  try {
    if (!name || !email || !password) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "Full name, Email and password are required."
          )
        );
    }

    const registration = new UserRegistration(name, email, password);

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
  res.clearCookie("authToken", {
    path: "/",
    domain: "localhost",
    secure: true,
    httpOnly: true,
  });
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

    const { id, name, user: username, email } = response.data!;

    const sessionUser: SessionUser = { id: id!, name, email, user: username };
    const token = await createJwt(sessionUser);

    res.cookie("authToken", token, { httpOnly: true, secure: true });
    res.redirect(302, "http://localhost:3000");
  } catch (err) {
    logger.err(err);
    res.status(500).send("error");
  }
});

export default authRouter;
