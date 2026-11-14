import { createJwt, type SessionUser } from "@variamosple/variamos-security";
import type { Request, RequestHandler, Response, Router } from "express";
import EnvVars from "#src/common/EnvVars.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { KnownAccount } from "#src/Domain/Activity/AccessEntry.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import type { SingInResponse } from "#src/Domain/User/Entity/SingInResponse.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import { recordAccess } from "./accessJournal.js";
import { type AuthContext, sessionUserOf } from "./authContext.js";
import {
  guestSignInBody,
  signInBody,
  signInMfaBody,
} from "./authRequestBodies.js";
import {
  getCookieOptions,
  getRedirectUrl,
  MFA_PENDING_COOKIE,
  MFA_TRUSTED_COOKIE,
  mfaPendingCookieOptions,
  mfaTrustedCookieOptions,
  trustedDeviceToken,
} from "./authWeb.js";
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

// Reason of a refused second factor, from the code of the answer
const MFA_FAILURES: Record<string, string> = {
  [DomainErrorCodes.INVALID_INPUT]: "wrong_code",
  [DomainErrorCodes.TOO_MANY_REQUESTS]: "too_many_attempts",
  [DomainErrorCodes.UNAUTHORIZED_ACCESS]: "expired",
  [DomainErrorCodes.UNAVAILABLE]: "unavailable",
};

// A wrong code keeps the pending sign-in; any other failure ends it
const refuseMfaCode = (
  ctx: AuthContext,
  req: Request,
  res: Response,
  failure: { checked: ResponseModel<string>; pendingUserId: string | null },
) => {
  const { checked, pendingUserId } = failure;
  const { accessJournal } = ctx;
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
const trustDevice = async (ctx: AuthContext, res: Response, userId: string) => {
  const { mfaSignIn } = ctx;
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
  ctx: AuthContext,
  req: Request,
  res: Response,
  signIn: { userId: string; account?: User | null; rememberDevice: boolean },
) => {
  const { accessJournal, openSession } = ctx;
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
  if (rememberDevice) await trustDevice(ctx, res, userId);
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

const signInWithPassword =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userAuthUseCase, mfaSignIn, accessJournal, openSession } = ctx;
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
  };

const signInMfa =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userQueryUseCase, mfaSignIn } = ctx;
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
        refuseMfaCode(ctx, req, res, { checked, pendingUserId });
        return;
      }

      // Read again: the account may have been disabled since the password
      const found = await userQueryUseCase.sessionUser(
        new RequestModel<string>(transactionId, checked.data),
      );
      clearPending();
      await finishMfaSignIn(ctx, req, res, {
        userId: checked.data,
        account: found.errorCode ? undefined : found.data,
        rememberDevice: rememberDevice === true,
      });
    } catch (err) {
      sendError(res, err, transactionId);
    }
  };

const signInAsGuest =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userAuthUseCase } = ctx;
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
  };

/** Sign-in routes: password, second factor, guest. */
export function addSignInRoutes(router: Router, ctx: AuthContext): void {
  router.post("/sign-in", signInWithPassword(ctx));
  router.post("/sign-in/mfa", signInMfa(ctx));
  router.post("/guest/sign-in", signInAsGuest(ctx));
}
