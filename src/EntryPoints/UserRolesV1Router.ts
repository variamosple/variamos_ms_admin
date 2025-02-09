import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { UserRole } from "@src/Domain/User/Entity/UserRole";
import { UserRoleFilter } from "@src/Domain/User/Entity/UserRoleFilter";
import { UserRoleUseCases } from "@src/Domain/User/UserRoleUseCases";
import { hasPermissions } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const USER_ROLES_V1_ROUTE = "/:userId/roles";

const userRolesV1Router = Router({ mergeParams: true });

userRolesV1Router.get(
  "/",
  hasPermissions(["users::query"]),
  async (req, res) => {
    const transactionId = "queryUserRoles";
    const { pageNumber, pageSize } = req.query;
    const userId = req.params.userId;
    try {
      if (!userId) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "userId is required."
            )
          );
      }

      const filter: UserRoleFilter = UserRoleFilter.builder()
        .setUserId(userId)
        .setPageNumber(pageNumber as unknown as number)
        .setPageSize(pageSize as unknown as number)
        .build();

      const request = new RequestModel<UserRoleFilter>(transactionId, filter);
      const response = await new UserRoleUseCases().queryUserRoles(request);

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

userRolesV1Router.get(
  "/details",
  hasPermissions(["users::query"]),
  async (req, res) => {
    const transactionId = "queryUserRolesDetails";
    const { pageNumber, pageSize } = req.query;
    const userId = req.params.userId;
    try {
      if (!userId) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "userId is required."
            )
          );
      }

      const filter: UserRoleFilter = UserRoleFilter.builder()
        .setUserId(userId)
        .setPageNumber(pageNumber as unknown as number)
        .setPageSize(pageSize as unknown as number)
        .build();

      const request = new RequestModel<UserRoleFilter>(transactionId, filter);
      const response = await new UserRoleUseCases().queryUserRolesDetails(
        request
      );

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

userRolesV1Router.post(
  "/",
  hasPermissions(["users::update"]),
  async (req, res) => {
    const transactionId = "createUserRole";
    const userId = req.params.userId;
    const { roleId } = req.body;
    try {
      if (!userId || !roleId || Number.isNaN(+roleId)) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "userId and roleId are required."
            )
          );
      }

      const userRole: UserRole = new UserRole(userId, Number.parseInt(roleId));

      const request = new RequestModel<UserRole>(transactionId, userRole);
      const response = await new UserRoleUseCases().createUserRole(request);

      const status = response.errorCode || HttpStatusCodes.CREATED;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

userRolesV1Router.delete(
  "/:roleId",
  hasPermissions(["users::update"]),
  async (req, res) => {
    const transactionId = "deleteUserRole";
    const { userId, roleId } = req.params;
    try {
      if (!userId || !roleId || Number.isNaN(+roleId)) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "userId and roleId are required."
            )
          );
      }

      const userRole: UserRole = new UserRole(userId, Number.parseInt(roleId));

      const request = new RequestModel<UserRole>(transactionId, userRole);
      const response = await new UserRoleUseCases().deleteUserRole(request);

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

export default userRolesV1Router;
