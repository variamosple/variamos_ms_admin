import {
  createJwt,
  getToken,
  isSessionExpired,
  type SessionUser,
  sessionInfoToSessionUser,
  validateToken,
} from "@variamosple/variamos-security";
import type { RequestHandler, Response, Router } from "express";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import logger from "#src/common/logger.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AUTH_ROUTE, type AuthContext, sessionUserOf } from "./authContext.js";
import { redirectBody } from "./authRequestBodies.js";
import {
  getCookieOptions,
  getRedirectUrl,
  getUrl,
  isAllowedRedirect,
} from "./authWeb.js";
import { readBody } from "./requestBody.js";

/** Body of GET /auth/session-info: an HTTP shape, not a domain entity. */
interface SessionInfoResponse {
  user: SessionUser | null;
  authToken?: string;
  redirect?: string;
}

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
    const { isExternalDomain } = ctx;
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

      const sessionUser = await reloadSessionUser(ctx, user.sub, user.roles);
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

      const redirect = getRedirectUrl("getSessionInfo", req, res);

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
  };

const logout =
  (_ctx: AuthContext): RequestHandler =>
  (_, res) => {
    const cookieOptions = getCookieOptions({
      maxAge: false,
    });

    res.clearCookie("authToken", cookieOptions);
    res.status(200).json(new ResponseModel<void>("logout"));
  };

const setRedirect =
  (_ctx: AuthContext): RequestHandler =>
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
      res.cookie("redirectTo", url, getCookieOptions({ sameSite: "none" }));
    }

    res.status(200).json(response);
  };

/** Session routes: read or refresh the session, sign out, the page to go back to. */
export function addSessionRoutes(router: Router, ctx: AuthContext): void {
  router.get("/session-info", sessionInfo(ctx));
  router.post("/logout", logout(ctx));
  router.post("/redirects", setRedirect(ctx));
}
