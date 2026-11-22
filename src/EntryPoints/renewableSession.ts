import {
  getToken,
  isSessionExpired,
  sessionInfoToSessionUser,
  validateToken,
} from "@variamosple/variamos-security";
import type { RequestHandler } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

/**
 * Whether session-info may still refresh an expired session: within the
 * lifetime of its cookie, counted from when the token was issued.
 */
export const canRenewSession = (
  issuedAtSeconds: number | undefined,
  cookieMaxAgeMs: number,
  now = Date.now(),
): boolean =>
  issuedAtSeconds !== undefined &&
  now <= issuedAtSeconds * 1000 + cookieMaxAgeMs;

/**
 * Like isAuthenticated, but also lets through a session that session-info
 * would refresh: a signed token, expired since less than its cookie lives.
 * The browser refreshes its session once a minute only, so a route called
 * in between would refuse a session that is about to be renewed (ADM-N19).
 * A route behind it must read the account again, as session-info does.
 */
export function renewableSession(cookieMaxAgeMs: number): RequestHandler {
  const refuse = (res: Parameters<RequestHandler>[1], message: string) => {
    res
      .status(HttpStatusCodes.UNAUTHORIZED)
      .json(
        new ResponseModel("session").withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          message,
        ),
      );
  };
  return async (req, res, next) => {
    try {
      const validation = await validateToken(getToken(req));
      const session = validation.data;
      if (validation.errorCode || !session) {
        refuse(res, "A valid session is required.");
        return;
      }
      if (
        isSessionExpired(session.exp) &&
        !canRenewSession(session.iat, cookieMaxAgeMs)
      ) {
        refuse(res, "Your session has expired, please log in again.");
        return;
      }
      req.user = sessionInfoToSessionUser(session);
      next();
    } catch {
      refuse(res, "A valid session is required.");
    }
  };
}
