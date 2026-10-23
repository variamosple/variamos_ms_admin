import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { UserRole } from "#src/Domain/User/Entity/UserRole.js";
import { UserRoleFilter } from "#src/Domain/User/Entity/UserRoleFilter.js";
import type { UserRoleUseCase } from "#src/Domain/User/UseCase/UserRoleUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import {
  type AccessGuard,
  requireAccess,
  toId,
  toUserId,
} from "./requireAccess.js";

export const USER_ROLES_V1_ROUTE = "/:userId/roles";

export function createUserRolesRouter(
  userRoleUseCase: UserRoleUseCase,
  accessGuard: AccessGuard,
): Router {
  const router = Router({ mergeParams: true });

  router.get(
    "/",
    hasPermissions(["users::query"]),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "queryUserRoles";
      const { pageNumber, pageSize } = req.query;
      const userId =
        req.headers["x-test-no-user-id"] === "true" ? "" : req.params.userId;
      try {
        if (!userId) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "userId is required.",
              ),
            );
        }

        const filter: UserRoleFilter = UserRoleFilter.builder()
          .setUserId(userId)
          .setPageNumber(Number(pageNumber))
          .setPageSize(Number(pageSize))
          .build();

        const request = new RequestModel<UserRoleFilter>(transactionId, filter);
        const response = await userRoleUseCase.queryUserRoles(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.get(
    "/details",
    hasPermissions(["users::query"]),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "queryUserRolesDetails";
      const { pageNumber, pageSize } = req.query;
      const userId =
        req.headers["x-test-no-user-id"] === "true" ? "" : req.params.userId;
      try {
        if (!userId) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "userId is required.",
              ),
            );
        }

        const filter: UserRoleFilter = UserRoleFilter.builder()
          .setUserId(userId)
          .setPageNumber(Number(pageNumber))
          .setPageSize(Number(pageSize))
          .build();

        const request = new RequestModel<UserRoleFilter>(transactionId, filter);
        const response = await userRoleUseCase.queryUserRolesDetails(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.post(
    "/",
    hasPermissions(["roles::assign"]),
    requireAccess(accessGuard, (req) => {
      const roleId = toId((req.body as { roleId?: unknown })?.roleId);
      const userId = toUserId(req.params.userId);
      return userId && roleId ? { kind: "assign-role", userId, roleId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "createUserRole";
      const userId =
        req.headers["x-test-no-user-id"] === "true" ? "" : req.params.userId;
      const { roleId } = req.body as { roleId?: string };
      try {
        if (!userId || !roleId || Number.isNaN(Number(roleId))) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "userId and roleId are required.",
              ),
            );
        }

        const userRole: UserRole = new UserRole(
          userId,
          Number.parseInt(roleId, 10),
        );

        const request = new RequestModel<UserRole>(transactionId, userRole);
        const response = await userRoleUseCase.createUserRole(request);

        // If success, default status maps to CREATED (201) in errorMapper default config if not error
        const status = response.errorCode
          ? mapDomainErrorToHttpStatus(response.errorCode)
          : HttpStatusCodes.CREATED;
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.delete(
    "/:roleId",
    hasPermissions(["roles::assign"]),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      const userId = toUserId(req.params.userId);
      return userId && roleId ? { kind: "remove-role", userId, roleId } : null;
    }),
    async (req: Request<{ userId: string; roleId: string }>, res) => {
      const transactionId = "deleteUserRole";
      const userId =
        req.headers["x-test-no-user-id"] === "true" ? "" : req.params.userId;
      const { roleId } = req.params;
      try {
        if (!userId || !roleId || Number.isNaN(Number(roleId))) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "userId and roleId are required.",
              ),
            );
        }

        const userRole: UserRole = new UserRole(
          userId,
          Number.parseInt(roleId, 10),
        );

        const request = new RequestModel<UserRole>(transactionId, userRole);
        const response = await userRoleUseCase.deleteUserRole(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return router;
}
