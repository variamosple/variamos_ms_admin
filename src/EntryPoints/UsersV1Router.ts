import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { UserFilter } from "#src/Domain/User/Entity/UserFilter.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { type AccessGuard, requireAccess, toUserId } from "./requireAccess.js";
import { USER_ROLES_V1_ROUTE } from "./UserRolesV1Router.js";

export const USERS_V1_ROUTE = "/v1/users";

export function createUsersRouter(
  userQueryUseCase: UserQueryUseCase,
  userPasswordUseCase: UserPasswordUseCase,
  userManagementUseCase: UserManagementUseCase,
  userRolesRouter: Router,
  accessGuard: AccessGuard,
): Router {
  const router = Router();

  router.get("/", hasPermissions(["users::query"]), async (req, res) => {
    const transactionId = "queryUsers";
    const { pageNumber, pageSize, name = null, search = null } = req.query;
    try {
      const filter: UserFilter = UserFilter.builder()
        .setSearch(search as string)
        .setName(name as string)
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .build();

      const request = new RequestModel<UserFilter>(transactionId, filter);
      const response = await userQueryUseCase.queryList(request);

      const status = mapDomainErrorToHttpStatus(
        response.errorCode as DomainErrorCodes,
      );
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });

  router.get(
    "/:userId",
    hasPermissions(["users::query"]),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "queryUserById";
      const userId = req.params.userId;

      try {
        const request = new RequestModel<string>(transactionId, userId);
        const response = await userQueryUseCase.queryById(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.post(
    "/:userId/recovery-link",
    hasPermissions(["users::update"]),
    requireAccess(accessGuard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "recovery-link", userId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "generateRecoveryLink";
      const userId = req.params.userId;
      const adminId = (req.user as { id: string }).id;

      try {
        const request = new RequestModel<{ userId: string; adminId: string }>(
          transactionId,
          {
            userId,
            adminId,
          },
        );
        const response = await userPasswordUseCase.generateLink(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.put(
    "/:userId/disable",
    hasPermissions(["users::update"]),
    requireAccess(accessGuard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "disable-account", userId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "disableUser";
      const userId = req.params.userId;

      try {
        const request = new RequestModel<string>(transactionId, userId);
        const response = await userManagementUseCase.disable(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.put(
    "/:userId/enable",
    hasPermissions(["users::update"]),
    requireAccess(accessGuard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "enable-account", userId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "enableUser";
      const userId = req.params.userId;

      try {
        const request = new RequestModel<string>(transactionId, userId);
        const response = await userManagementUseCase.enable(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.delete(
    "/:userId",
    hasPermissions(["users::delete"]),
    requireAccess(accessGuard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "delete-account", userId } : null;
    }),
    async (req: Request<{ userId: string }>, res) => {
      const transactionId = "deleteUser";
      const userId = req.params.userId;

      try {
        const request = new RequestModel<string>(transactionId, userId);
        const response = await userManagementUseCase.delete(request);

        const status = mapDomainErrorToHttpStatus(
          response.errorCode as DomainErrorCodes,
        );
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.use(USER_ROLES_V1_ROUTE, userRolesRouter);

  return router;
}
