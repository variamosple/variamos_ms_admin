import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Role } from "#src/Domain/Role/Entity/Role.js";
import { RoleFilter } from "#src/Domain/Role/Entity/RoleFilter.js";
import type { RoleManagementUseCase } from "#src/Domain/Role/UseCase/RoleManagementUseCase.js";
import type { RoleQueryUseCase } from "#src/Domain/Role/UseCase/RoleQueryUseCase.js";
import { actorOf } from "./actor.js";
import { nameBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { ROLE_PERMISSIONS_V1_ROUTE } from "./RolePermissionsV1Router.js";
import { validBody } from "./requestBody.js";
import { type AccessGuard, requireAccess, toId } from "./requireAccess.js";

export const ROLES_V1_ROUTE = "/v1/roles";

export function createRolesRouter(
  roleManagementUseCase: RoleManagementUseCase,
  roleQueryUseCase: RoleQueryUseCase,
  rolePermissionsRouter: Router,
  accessGuard: AccessGuard,
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
      sendError(res, error, transactionId);
    }
  });

  rolesV1Router.post(
    "/",
    hasPermissions(["roles::create"]),
    validBody(nameBody, "createRole"),
    async (req, res) => {
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

        const request = new RequestModel<Role>(
          transactionId,
          role,
          actorOf(req),
        );
        const response = await roleManagementUseCase.createRole(request);

        const status = response.errorCode
          ? mapDomainErrorToHttpStatus(response.errorCode)
          : HttpStatusCodes.CREATED;
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  rolesV1Router.delete(
    "/:roleId",
    hasPermissions(["roles::delete"]),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      return roleId ? { kind: "delete-role", roleId } : null;
    }),
    async (req: Request<{ roleId: string }>, res) => {
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

        const request = new RequestModel<string>(
          transactionId,
          roleId,
          actorOf(req),
        );
        const response = await roleManagementUseCase.deleteRole(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  rolesV1Router.get(
    "/:roleId",
    hasPermissions(["roles::query"]),
    async (req: Request<{ roleId: string }>, res) => {
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
        sendError(res, error, transactionId);
      }
    },
  );

  rolesV1Router.put(
    "/:roleId",
    hasPermissions(["roles::update"]),
    validBody(nameBody, "updateRole"),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      return roleId ? { kind: "update-role", roleId } : null;
    }),
    async (req: Request<{ roleId: string }>, res) => {
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
          permission = new Role(Number.parseInt(roleId, 10), name);
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

        const request = new RequestModel<Role>(
          transactionId,
          permission,
          actorOf(req),
        );
        const response = await roleManagementUseCase.updateRole(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  rolesV1Router.use(ROLE_PERMISSIONS_V1_ROUTE, rolePermissionsRouter);

  return rolesV1Router;
}
