import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, type Response, Router } from "express";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { MfaResetUseCase } from "#src/Domain/Mfa/UseCase/MfaResetUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import type { PermissionGuard } from "./MfaRouter.js";
import { type AccessGuard, requireAccess, toUserId } from "./requireAccess.js";

export const USER_MFA_V1_ROUTE = "/v1/users/:userId/mfa";

/** Created in production by the project lead before the merge. */
export const RESET_MFA_PERMISSION = "users::reset-mfa";

/**
 * Second factor of another account, for administrators
 * (SPC-2026-10-17-001, lot 4): whether it is on, and turning it off when
 * its owner lost it. Turning it off follows the role hierarchy, never on
 * one's own account.
 */
export function createUserMfaRouter(
  useCase: MfaResetUseCase,
  accessGuard: AccessGuard,
  requirePermissions: PermissionGuard = hasPermissions,
): Router {
  const router = Router({ mergeParams: true });

  const send = <T>(res: Response, response: ResponseModel<T>) => {
    res
      .status(
        mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes),
      )
      .json(response);
  };

  const fail = (res: Response, transactionId: string, error: unknown) => {
    sendError(res, error, transactionId);
  };

  router.get(
    "/",
    requirePermissions([RESET_MFA_PERMISSION]),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "getAccountMfaStatus";
      try {
        send(res, await useCase.status(transactionId, req.params.userId));
      } catch (error) {
        fail(res, transactionId, error);
      }
    },
  );

  router.delete(
    "/",
    requirePermissions([RESET_MFA_PERMISSION]),
    requireAccess(accessGuard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "reset-mfa", userId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "resetAccountMfa";
      const adminId = (req.user as { id: string }).id;
      try {
        send(
          res,
          await useCase.reset(transactionId, req.params.userId, adminId),
        );
      } catch (error) {
        fail(res, transactionId, error);
      }
    },
  );

  return router;
}
