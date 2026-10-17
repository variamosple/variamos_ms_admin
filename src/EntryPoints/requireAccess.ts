import type { NextFunction, Request, RequestHandler, Response } from "express";
import logger from "jet-logger";
import { describeError } from "#src/common/describeError.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { AccessCheck } from "#src/Domain/AccessControl/AccessCheck.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

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
      const operatorId = (req.user as { id?: string } | undefined)?.id;
      const decision = await guard.authorize(operatorId, check);
      if (decision.errorCode) {
        return res
          .status(mapDomainErrorToHttpStatus(decision.errorCode))
          .json(decision);
      }
      next();
    } catch (error) {
      logger.err(describeError(error));
      res
        .status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
        .json(
          new ResponseModel<void>("authorizeAccess").withError(
            DomainErrorCodes.SYSTEM_ERROR,
            "Internal Server Error",
          ),
        );
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
