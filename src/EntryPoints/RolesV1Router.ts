import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { RoleQueryUseCase } from "@src/Domain/Role/UseCase/RoleQueryUseCase";
import { RoleManagementUseCase } from "@src/Domain/Role/UseCase/RoleManagementUseCase";
import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { ROLE_PERMISSIONS_V1_ROUTE } from "./RolePermissionsV1Router";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

export const ROLES_V1_ROUTE = "/v1/roles";

export function createRolesRouter(
  roleManagementUseCase: RoleManagementUseCase,
  roleQueryUseCase: RoleQueryUseCase,
  rolePermissionsRouter: Router,
): Router {
  const rolesV1Router = Router();

  rolesV1Router.get("/", hasPermissions(["roles::query"]), async (req, res) => {
    const transactionId = "queryRoles";
    const { pageNumber, pageSize, name = null } = req.query;
    try {
      const filter: RoleFilter = RoleFilter.builder()
        .setName(name as string)
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .build();

      const request = new RequestModel<RoleFilter>(transactionId, filter);
      const response = await roleQueryUseCase.queryRoles(request);

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

  rolesV1Router.post("/", hasPermissions(["roles::create"]), async (req, res) => {
    const transactionId = "createRole";
    const { name } = req.body as { name?: string };
    try {
      if (!name) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "name is required.",
            ),
          );
      }

      let role: Role;
      try {
        role = new Role(null, name);
      } catch (error) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              (error as Error).message,
            ),
          );
      }

      const request = new RequestModel<Role>(transactionId, role);
      const response = await roleManagementUseCase.createRole(request);

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

  rolesV1Router.delete("/:roleId", hasPermissions(["roles::delete"]), async (req, res) => {
    const transactionId = "deleteRole";
    const roleId = req.params.roleId;
    try {
      if (!roleId || Number.isNaN(Number(roleId))) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "roleId is required.",
            ),
          );
      }

      const request = new RequestModel<string>(transactionId, roleId);
      const response = await roleManagementUseCase.deleteRole(request);

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

  rolesV1Router.get("/:roleId", hasPermissions(["roles::query"]), async (req, res) => {
    const transactionId = "queryRoleById";
    const roleId = req.params.roleId;
    try {
      if (!roleId || Number.isNaN(Number(roleId))) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "roleId is required.",
            ),
          );
      }

      const request = new RequestModel<string>(transactionId, roleId);
      const response = await roleQueryUseCase.queryById(request);

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

  rolesV1Router.put("/:roleId", hasPermissions(["roles::update"]), async (req, res) => {
    const transactionId = "updateRole";
    const roleId = req.params.roleId;
    const { name } = req.body as { name?: string };
    try {
      if (!roleId || Number.isNaN(Number(roleId))) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "roleId is required.",
            ),
          );
      }

      if (!name) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              "name is required.",
            ),
          );
      }

      let permission: Role;
      try {
        permission = new Role(Number.parseInt(roleId), name);
      } catch (error) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<void>(transactionId).withError(
              DomainErrorCodes.INVALID_INPUT,
              (error as Error).message,
            ),
          );
      }

      const request = new RequestModel<Role>(transactionId, permission);
      const response = await roleManagementUseCase.updateRole(request);

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

  rolesV1Router.use(ROLE_PERMISSIONS_V1_ROUTE, rolePermissionsRouter);

  return rolesV1Router;
}
