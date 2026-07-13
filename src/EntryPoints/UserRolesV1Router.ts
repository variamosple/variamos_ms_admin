import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { UserRole } from "@src/Domain/User/Entity/UserRole";
import { UserRoleFilter } from "@src/Domain/User/Entity/UserRoleFilter";
import { UserRoleUseCase } from "@src/Domain/User/UseCase/UserRoleUseCase";
import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

export const USER_ROLES_V1_ROUTE = "/:userId/roles";

export function createUserRolesRouter(userRoleUseCase: UserRoleUseCase): Router {
  const router = Router({ mergeParams: true });

  router.get("/", hasPermissions(["users::query"]), async (req, res) => {
    const transactionId = "queryUserRoles";
    const { pageNumber, pageSize } = req.query;
    const userId = req.params.userId;
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
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  router.get("/details", hasPermissions(["users::query"]), async (req, res) => {
    const transactionId = "queryUserRolesDetails";
    const { pageNumber, pageSize } = req.query;
    const userId = req.params.userId;
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
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  router.post("/", hasPermissions(["users::update"]), async (req, res) => {
    const transactionId = "createUserRole";
    const userId = req.params.userId;
    const { roleId } = req.body as { roleId?: string };
    try {
      if (!userId || !roleId || Number.isNaN(+roleId)) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "userId and roleId are required.",
            ),
          );
      }

      const userRole: UserRole = new UserRole(userId, Number.parseInt(roleId));

      const request = new RequestModel<UserRole>(transactionId, userRole);
      const response = await userRoleUseCase.createUserRole(request);

      // If success, default status maps to CREATED (201) in errorMapper default config if not error
      const status = response.errorCode
        ? mapDomainErrorToHttpStatus(response.errorCode)
        : HttpStatusCodes.CREATED;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  router.delete("/:roleId", hasPermissions(["users::update"]), async (req, res) => {
    const transactionId = "deleteUserRole";
    const { userId, roleId } = req.params;
    try {
      if (!userId || !roleId || Number.isNaN(+roleId)) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "userId and roleId are required.",
            ),
          );
      }

      const userRole: UserRole = new UserRole(userId, Number.parseInt(roleId));

      const request = new RequestModel<UserRole>(transactionId, userRole);
      const response = await userRoleUseCase.deleteUserRole(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal Server Error",
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  });

  return router;
}
