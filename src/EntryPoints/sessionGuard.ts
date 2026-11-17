import { getToken, validateSession } from "@variamosple/variamos-security";
import type { RequestHandler } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AUTH_ROUTE } from "./authContext.js";
import { sessionIdOf } from "./authWeb.js";
import { sendError } from "./errorResponse.js";
import type { SessionGate } from "./sessionGate.js";

// Open without a session, or checking the session themselves: a browser
// whose session ended must still be able to sign in again or sign out
const OPEN_AUTH_PATHS = new Set(
  [
    "/session-info",
    "/logout",
    "/redirects",
    "/sign-in",
    "/sign-in/mfa",
    "/guest/sign-in",
    "/google/callback",
    "/sign-up",
    "/password-policy",
    "/forgot-password",
    "/verify-token",
    "/reset-password",
  ].map((path) => `${AUTH_ROUTE}${path}`),
);

/**
 * Refuses a request whose token is valid but whose session ended: signed out,
 * revoked by a password change or the closing of the account, idle or too
 * old (EV-74 lot 2). A request without a valid token goes on: the route
 * decides, as before.
 */
export function refuseEndedSessions(sessions: SessionGate): RequestHandler {
  return async (req, res, next) => {
    if (OPEN_AUTH_PATHS.has(req.path)) return next();
    const token = getToken(req);
    if (!token) return next();
    const validation = await validateSession(token).catch(() => null);
    const session = validation?.errorCode ? undefined : validation?.data;
    if (!session?.sub) return next();
    try {
      const refusal = await sessions.check(
        sessionIdOf(req),
        session.sub,
        (session.iat ?? 0) * 1000,
      );
      if (!refusal) return next();
      res
        .status(HttpStatusCodes.UNAUTHORIZED)
        .json(
          new ResponseModel<void>("checkSession").withError(
            DomainErrorCodes.UNAUTHORIZED_ACCESS,
            "Your session has ended, please log in again.",
          ),
        );
    } catch (error) {
      sendError(res, error, "checkSession");
    }
  };
}
