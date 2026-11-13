import { createJwt } from "@variamosple/variamos-security";
import type { Request, RequestHandler, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
import logger from "#src/common/logger.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  GOOGLE_SIGN_IN_REFUSALS,
  type GoogleProfile,
  isVerifiedClaim,
} from "#src/Domain/User/Entity/GoogleIdentity.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import { recordAccess } from "./accessJournal.js";
import { type AuthContext, sessionUserOf } from "./authContext.js";
import { googleCallbackBody } from "./authRequestBodies.js";
import {
  getCookieOptions,
  getRedirectUrl,
  MFA_PENDING_COOKIE,
  mfaPendingCookieOptions,
  trustedDeviceToken,
} from "./authWeb.js";
import { readBody } from "./requestBody.js";

/**
 * Whether the g_csrf_token cookie Google sets on our domain matches the one
 * it posts with the credential (redirect mode of Sign In With Google).
 */
const hasMatchingGoogleCsrfToken = (
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
  ctx: AuthContext,
  req: Request,
  res: Response,
  refused: { response: ResponseModel<User>; email: string | undefined },
) => {
  const { response, email } = refused;
  const { accessJournal } = ctx;
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
  res.redirect(302, `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=${reason}`);
};

// An error after the checks: recorded once, back to the login page
const failGoogleSignIn = (ctx: AuthContext, req: Request, res: Response) => {
  const { accessJournal } = ctx;
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
const askGoogleMfaCode = async (
  ctx: AuthContext,
  res: Response,
  pendingToken: string,
) => {
  const { mfaSignIn } = ctx;
  res.cookie(MFA_PENDING_COOKIE, pendingToken, mfaPendingCookieOptions());
  const days = await mfaSignIn.trustedDeviceDays();
  res.redirect(
    302,
    `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?mfa=required&trustedDeviceDays=${days}`,
  );
};

const googleCallback =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userAuthUseCase, mfaSignIn, accessJournal } = ctx;
    const transactionId = "loginWithGoogle";
    const body = readBody(googleCallbackBody, req, res, transactionId);
    if (!body) return;
    const { credential } = body;
    // Google posts the same random value in a cookie of our domain and in
    // the body; only a page of ours can set the cookie, so another site
    // cannot post a credential in the name of a visitor (EV-70 lot 5).
    // Refused since production showed that the cookie arrives.
    if (!hasMatchingGoogleCsrfToken(req, body.g_csrf_token)) {
      recordAccess(accessJournal, req, res, {
        event: "sign-in.google",
        outcome: "failed",
        reason: "google_csrf_mismatch",
      });
      res.redirect(
        302,
        `${EnvVars.Auth.APP.LOGIN_REDIRECT_URI}?reason=sign-in-failed`,
      );
      return;
    }
    try {
      const profile = await validateGoogleCode(credential);

      const request = new RequestModel<GoogleProfile>(transactionId, profile);
      const response = await userAuthUseCase.signInWithGoogle(request);

      // The login page shows the message of a reason code, never a text
      // read from its address (T-16)
      if (response.errorCode) {
        await refuseGoogleSignIn(ctx, req, res, {
          response,
          email: profile.email,
        });
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
        await askGoogleMfaCode(ctx, res, pendingToken);
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
      failGoogleSignIn(ctx, req, res);
    }
  };

/** Sign-in with Google. */
export function addGoogleRoutes(router: Router, ctx: AuthContext): void {
  router.post("/google/callback", googleCallback(ctx));
}
