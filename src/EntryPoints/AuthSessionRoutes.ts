import {
  getToken,
  isSessionExpired,
  type SessionUser,
  sessionInfoToSessionUser,
  validateToken,
} from "@variamosple/variamos-security";
import type { RequestHandler, Response, Router } from "express";
import { describeError } from "#src/common/describeError.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { isLocalDevOrigin } from "#src/common/localDevOrigins.js";
import logger from "#src/common/logger.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AUTH_ROUTE, type AuthContext, sessionUserOf } from "./authContext.js";
import { redirectBody } from "./authRequestBodies.js";
import { isAllowedRedirect, withLocalDevToken } from "./authWeb.js";
import { canRenewSession } from "./renewableSession.js";
import { readBody } from "./requestBody.js";
import { createSessionJwt } from "./sessionToken.js";

/**
 * Body of GET /auth/session-info: an HTTP shape, not a domain entity. The
 * token stays in the httpOnly cookie, out of reach of the page's scripts
 * (EV-117); only a local interface allowed by AUTH_LOCAL_DEV_ORIGINS receives
 * the refreshed one here, for a while, since it cannot read that cookie.
 */
interface SessionInfoResponse {
  user: SessionUser | null;
  authToken?: string;
  redirect?: string;
}

/**
 * The host a session token was issued for. Its audience is the list
 * ["variamos-platform", host] (variamos-security 0.0.17 and later), or that
 * host alone for a token issued before.
 */
export const audienceHostOf = (aud: unknown): string | undefined => {
  const entries = Array.isArray(aud) ? aud : [aud];
  return entries.find(
    (entry): entry is string =>
      typeof entry === "string" && entry !== "variamos-platform",
  );
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
  ctx: AuthContext,
  sub: string | undefined,
  tokenRoles: string[] | undefined,
): Promise<SessionUser | null> => {
  const { userAuthUseCase, userQueryUseCase } = ctx;
  const isGuest =
    tokenRoles?.some((role: string) => role.toLowerCase() === "guest") ?? false;
  const request = new RequestModel<string>("getSessionInfo", sub);
  const refreshedUser = isGuest
    ? await userAuthUseCase.getGuestData(request)
    : await userQueryUseCase.sessionUser(request);
  if (refreshedUser.errorCode || !refreshedUser.data) return null;
  return sessionUserOf(refreshedUser.data);
};

const sessionInfo =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
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
        const redirect = withLocalDevToken(
          ctx.redirectUrl("getSessionInfo", req, res),
          authToken,
        );

        res.status(200).json(
          response.withResponse({
            user: sessionInfoToSessionUser(user),
            redirect: redirect?.toString(),
          }),
        );
        return;
      }

      // An expired token is refreshed until the cookie's own age
      if (!user?.iat || !canRenewSession(user.iat, ctx.web.cookie.maxAge)) {
        sessionExpired(res, response);
        return;
      }

      const sessionUser = await reloadSessionUser(ctx, user.sub, user.roles);
      if (!sessionUser) {
        sessionExpired(res, response);
        return;
      }
      // The refreshed token is for the same host: createJwt sets the issuer
      // and the audience ["variamos-platform", host] again, which
      // vms_projects reads since the Python variamos-security 0.0.3
      const host = audienceHostOf(user.aud);
      const token = await createSessionJwt(sessionUser, host);

      const redirect = withLocalDevToken(
        ctx.redirectUrl("getSessionInfo", req, res),
        token,
      );
      const origin = req.headers.origin;
      const localDev = origin !== undefined && isLocalDevOrigin(origin);

      res
        .cookie("authToken", token, ctx.cookieOptions())
        .status(200)
        .json(
          response.withResponse({
            user: sessionUser,
            authToken: localDev ? token : undefined,
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
  };

const logout =
  (ctx: AuthContext): RequestHandler =>
  (_, res) => {
    const cookieOptions = ctx.cookieOptions({
      maxAge: false,
    });

    res.clearCookie("authToken", cookieOptions);
    res.status(200).json(new ResponseModel<void>("logout"));
  };

const setRedirect =
  (ctx: AuthContext): RequestHandler =>
  (request, res) => {
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
      res.cookie("redirectTo", url, ctx.cookieOptions({ sameSite: "none" }));
    }

    res.status(200).json(response);
  };

/** Session routes: read or refresh the session, sign out, the page to go back to. */
export function addSessionRoutes(router: Router, ctx: AuthContext): void {
  router.get("/session-info", sessionInfo(ctx));
  router.post("/logout", logout(ctx));
  router.post("/redirects", setRedirect(ctx));
}
