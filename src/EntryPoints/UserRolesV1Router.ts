import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, type RequestHandler, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { UserRole } from "#src/Domain/User/Entity/UserRole.js";
import { UserRoleFilter } from "#src/Domain/User/Entity/UserRoleFilter.js";
import type { UserRoleUseCase } from "#src/Domain/User/UseCase/UserRoleUseCase.js";
import { actorOf } from "./actor.js";
import { userRoleBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { checkedBody, validBody } from "./requestBody.js";
import {
  type AccessGuard,
  requireAccess,
  toId,
  toUserId,
} from "./requireAccess.js";

export const USER_ROLES_V1_ROUTE = "/:userId/roles";

/** Pages of a user's roles, as the use case's `query` answers them. */
const pageOfUserRoles =
  (
    transactionId: string,
    query: (
      request: RequestModel<UserRoleFilter>,
    ) => Promise<ResponseModel<unknown>>,
  ): RequestHandler<{ userId: string }> =>
  async (req: Request<{ userId: string }>, res) => {
    const { pageNumber, pageSize } = req.query;
    const { userId } = req.params;
    try {
      const filter: UserRoleFilter = UserRoleFilter.builder()
        .setUserId(userId)
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .build();

      const response = await query(
        new RequestModel<UserRoleFilter>(transactionId, filter),
      );

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryUserRoles = (
  userRoleUseCase: UserRoleUseCase,
): RequestHandler<{ userId: string }> =>
  pageOfUserRoles("queryUserRoles", (request) =>
    userRoleUseCase.queryUserRoles(request),
  );

const queryUserRolesDetails = (
  userRoleUseCase: UserRoleUseCase,
): RequestHandler<{ userId: string }> =>
  pageOfUserRoles("queryUserRolesDetails", (request) =>
    userRoleUseCase.queryUserRolesDetails(request),
  );

const createUserRole =
  (userRoleUseCase: UserRoleUseCase): RequestHandler<{ userId: string }> =>
  async (req: Request<{ userId: string }>, res) => {
    const transactionId = "createUserRole";
    const { userId } = req.params;
    const { roleId } = checkedBody(userRoleBody, req);
    try {
      if (!userId || !roleId || Number.isNaN(Number(roleId))) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "userId and roleId are required.",
            ),
          );
        return;
      }

      const userRole: UserRole = new UserRole(
        userId,
        Number.parseInt(String(roleId), 10),
      );

      const request = new RequestModel<UserRole>(
        transactionId,
        userRole,
        actorOf(req),
      );
      const response = await userRoleUseCase.createUserRole(request);

      // If success, default status maps to CREATED (201) in errorMapper default config if not error
      const status = response.errorCode
        ? mapDomainErrorToHttpStatus(response.errorCode)
        : HttpStatusCodes.CREATED;
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const deleteUserRole =
  (
    userRoleUseCase: UserRoleUseCase,
  ): RequestHandler<{ userId: string; roleId: string }> =>
  async (req: Request<{ userId: string; roleId: string }>, res) => {
    const transactionId = "deleteUserRole";
    const { userId } = req.params;
    const { roleId } = req.params;
    try {
      if (!userId || !roleId || Number.isNaN(Number(roleId))) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "userId and roleId are required.",
            ),
          );
        return;
      }

      const userRole: UserRole = new UserRole(
        userId,
        Number.parseInt(roleId, 10),
      );

      const request = new RequestModel<UserRole>(
        transactionId,
        userRole,
        actorOf(req),
      );
      const response = await userRoleUseCase.deleteUserRole(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

export function createUserRolesRouter(
  userRoleUseCase: UserRoleUseCase,
  accessGuard: AccessGuard,
): Router {
  const router = Router({ mergeParams: true });

  router.get(
    "/",
    hasPermissions(["users::query"]),
    queryUserRoles(userRoleUseCase),
  );

  router.get(
    "/details",
    hasPermissions(["users::query"]),
    queryUserRolesDetails(userRoleUseCase),
  );

  router.post(
    "/",
    hasPermissions(["roles::assign"]),
    validBody(userRoleBody, "createUserRole"),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(checkedBody(userRoleBody, req).roleId);
      const userId = toUserId(req.params.userId);
      return userId && roleId ? { kind: "assign-role", userId, roleId } : null;
    }),
    createUserRole(userRoleUseCase),
  );

  router.delete(
    "/:roleId",
    hasPermissions(["roles::assign"]),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      const userId = toUserId(req.params.userId);
      return userId && roleId ? { kind: "remove-role", userId, roleId } : null;
    }),
    deleteUserRole(userRoleUseCase),
  );

  return router;
}
