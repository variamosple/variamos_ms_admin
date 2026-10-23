import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AccessCheck } from "#src/Domain/AccessControl/AccessCheck.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { actorOf } from "./actor.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";

export interface AccessGuard {
  authorize(
    operatorId: string | undefined,
    check: AccessCheck,
  ): Promise<ResponseModel<void>>;
}

/**
 * Applies the role hierarchy after hasPermissions. `toCheck` returns null
 * when the request is malformed: the route handler then answers 400.
 */
export function requireAccess(
  guard: AccessGuard,
  toCheck: (req: Request) => AccessCheck | null,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const check = toCheck(req);
    if (!check) return next();
    try {
      const decision = await guard.authorize(actorOf(req), check);
      if (decision.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(decision.errorCode))
          .json(decision);
      }
      next();
    } catch (error) {
      sendError(res, error, "authorizeAccess");
    }
  };
}

/** A positive integer route or body value, or null. */
export const toId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** A non-empty account id, or null. */
export const toUserId = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;
