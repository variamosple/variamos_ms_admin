import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import userRolesV1Router, { USER_ROLES_V1_ROUTE } from "./UserRolesV1Router";
import EnvVars from "@src/common/EnvVars";
import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import { MailServiceInstance } from "@src/Infrastructure/Mail/MailService";
import { RoleRepositoryInstance } from "@src/DataProviders/Role/RoleRepository";
import { mapDomainErrorToHttpStatus } from "./errorMapper";

export const USERS_V1_ROUTE = "/v1/users";

const usersV1Router = Router();

const usersUseCases = new UsersUseCases(
  UserRepositoryInstance,
  MailServiceInstance,
  RoleRepositoryInstance,
  {
    passwordResetExpiryInMs: EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
    homeRedirectUri: EnvVars.Auth.APP.HOME_REDIRECT_URI as string,
  },
);

usersV1Router.get("/", hasPermissions(["users::query"]), async (req, res) => {
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
    const response = await usersUseCases.queryUsers(request);

    const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error as Error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.INTERNAL_ERROR,
      "Internal Server Error",
    );
    res.status(500).json(response);
  }
});

usersV1Router.get("/:userId", hasPermissions(["users::query"]), async (req, res) => {
  const transactionId = "queryUserById";
  const userId = req.params.userId;

  try {
    const request = new RequestModel<string>(transactionId, userId);
    const response = await usersUseCases.queryById(request);

    const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error as Error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.INTERNAL_ERROR,
      "Internal Server Error",
    );
    res.status(500).json(response);
  }
});

usersV1Router.post(
  "/:userId/recovery-link",
  hasPermissions(["users::update"]),
  async (req, res) => {
    const transactionId = "generateRecoveryLink";
    const userId = req.params.userId;
    const adminId = (req.user as { id: string }).id;

    try {
      const request = new RequestModel<{ userId: string; adminId: string }>(transactionId, {
        userId,
        adminId,
      });
      const response = await usersUseCases.generateRecoveryLink(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
      res.status(status).json(response);
    } catch (error) {
      logger.err(error as Error);
      const response = new ResponseModel(
        transactionId,
        DomainErrorCodes.INTERNAL_ERROR,
        "Internal Server Error",
      );
      res.status(500).json(response);
    }
  },
);

usersV1Router.put("/:userId/disable", hasPermissions(["users::update"]), async (req, res) => {
  const transactionId = "disableUser";
  const userId = req.params.userId;

  try {
    const request = new RequestModel<string>(transactionId, userId);
    const response = await usersUseCases.disableUser(request);

    const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error as Error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.INTERNAL_ERROR,
      "Internal Server Error",
    );
    res.status(500).json(response);
  }
});

usersV1Router.put("/:userId/enable", hasPermissions(["users::update"]), async (req, res) => {
  const transactionId = "enableUser";
  const userId = req.params.userId;

  try {
    const request = new RequestModel<string>(transactionId, userId);
    const response = await usersUseCases.enableUser(request);

    const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error as Error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.INTERNAL_ERROR,
      "Internal Server Error",
    );
    res.status(500).json(response);
  }
});

usersV1Router.delete("/:userId", hasPermissions(["users::delete"]), async (req, res) => {
  const transactionId = "deleteUser";
  const userId = req.params.userId;

  try {
    const request = new RequestModel<string>(transactionId, userId);
    const response = await usersUseCases.deleteUser(request);

    const status = mapDomainErrorToHttpStatus(response.errorCode as DomainErrorCodes);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error as Error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.INTERNAL_ERROR,
      "Internal Server Error",
    );
    res.status(500).json(response);
  }
});

usersV1Router.use(USER_ROLES_V1_ROUTE, userRolesV1Router);

export default usersV1Router;
