import EnvVars from "@src/common/EnvVars";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { User } from "@src/Domain/User/Entity/User";
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

    const user: User = { email: email!, name: name!, user: name!, id: null };

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
