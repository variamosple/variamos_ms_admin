import {
  hasPermissions,
  type SessionUser,
} from "@variamosple/variamos-security";
import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import logger from "jet-logger";
import { describeError } from "#src/common/describeError.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { UserMfaUseCase } from "#src/Domain/Mfa/UseCase/UserMfaUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { mfaFailureLimiter } from "./RateLimits.js";

export const MFA_ROUTE = "/auth/mfa";

/** Longest value accepted for a password or a code. */
const MAX_INPUT_LENGTH = 128;

export type PermissionGuard = (permissions: string[]) => RequestHandler;

const isGuest = (user: SessionUser) =>
  user.roles?.some((role) => role.toLowerCase() === "guest") ?? false;

const text = (body: unknown, field: string): string | null => {
  const value = (body as Record<string, unknown> | undefined)?.[field];
  return typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= MAX_INPUT_LENGTH
    ? value
    : null;
};

/**
 * Two-factor authentication of one's own account (SPC-2026-10-17-001):
 * status, enrollment with a first code, and removal. Guests have no
 * account, so no second factor.
 */
export function createMfaRouter(
  useCase: UserMfaUseCase,
  requirePermissions: PermissionGuard = hasPermissions,
): Router {
  const router = Router();
  const failureLimiter = mfaFailureLimiter();

  const handle =
    (
      transactionId: string,
      work: (
        user: SessionUser,
        req: Request,
      ) => Promise<ResponseModel<unknown>>,
    ) =>
    async (req: Request, res: Response) => {
      // Secrets and recovery codes must not stay in any cache
      res.setHeader("Cache-Control", "no-store");
      const user = req.user as SessionUser | undefined;
      if (!user?.id || isGuest(user)) {
        res
          .status(HttpStatusCodes.FORBIDDEN)
          .json(
            new ResponseModel(transactionId).withError(
              DomainErrorCodes.FORBIDDEN,
              "Two-factor authentication needs a signed-in account.",
            ),
          );
        return;
      }
      try {
        const response = await work(user, req);
        res
          .status(mapDomainErrorToHttpStatus(response.errorCode))
          .json(response);
      } catch (error) {
        logger.err(describeError(error));
        res
          .status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
          .json(
            new ResponseModel(transactionId).withError(
              DomainErrorCodes.SYSTEM_ERROR,
              "Internal Server Error",
            ),
          );
      }
    };

  const invalid = (transactionId: string, message: string) =>
    Promise.resolve(
      new ResponseModel(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        message,
      ),
    );

  router.get(
    "/",
    requirePermissions(["my-account::query"]),
    handle("getMfaStatus", (user) =>
      useCase.status("getMfaStatus", String(user.id)),
    ),
  );

  router.post(
    "/enrollment",
    requirePermissions(["my-account::update"]),
    failureLimiter,
    handle("startMfaEnrollment", (user, req) => {
      const password = text(req.body, "password");
      if (!password) {
        return invalid("startMfaEnrollment", "The password is required.");
      }
      return useCase.startEnrollment(
        "startMfaEnrollment",
        String(user.id),
        user.email,
        password,
      );
    }),
  );

  router.post(
    "/enrollment/confirm",
    requirePermissions(["my-account::update"]),
    failureLimiter,
    handle("confirmMfaEnrollment", (user, req) => {
      const code = text(req.body, "code");
      if (!code) {
        return invalid("confirmMfaEnrollment", "The code is required.");
      }
      return useCase.confirmEnrollment(
        "confirmMfaEnrollment",
        String(user.id),
        code,
      );
    }),
  );

  router.post(
    "/disable",
    requirePermissions(["my-account::update"]),
    failureLimiter,
    handle("disableMfa", (user, req) => {
      const password = text(req.body, "password");
      const code = text(req.body, "code");
      if (!password || !code) {
        return invalid("disableMfa", "The password and a code are required.");
      }
      return useCase.disable("disableMfa", String(user.id), password, code);
    }),
  );

  return router;
}
