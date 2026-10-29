import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { RolePermission } from "#src/Domain/Role/Entity/RolePermission.js";
import { RolePermissionFilter } from "#src/Domain/Role/Entity/RolePermissionFilter.js";
import type { RolePermissionUseCase } from "#src/Domain/Role/UseCase/RolePermissionUseCase.js";
import { actorOf } from "./actor.js";
import { rolePermissionBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { validBody } from "./requestBody.js";
import { type AccessGuard, requireAccess, toId } from "./requireAccess.js";

export const ROLE_PERMISSIONS_V1_ROUTE = "/:roleId/permissions";

export function createRolePermissionsRouter(
  rolePermissionUseCase: RolePermissionUseCase,
  accessGuard: AccessGuard,
): Router {
  const rolePermissionsV1Router = Router({ mergeParams: true });

  rolePermissionsV1Router.get(
    "/",
    hasPermissions(["roles::query"]),
    async (req: Request<{ roleId: string }>, res) => {
      const transactionId = "queryRolePermissions";
      const { pageNumber, pageSize, search } = req.query;
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

        const filter: RolePermissionFilter = RolePermissionFilter.builder()
          .setRoleId(Number.parseInt(roleId, 10))
          .setPageNumber(Number(pageNumber))
          .setPageSize(Number(pageSize))
          .setSearch(typeof search === "string" && search ? search : null)
          .build();

        const request = new RequestModel<RolePermissionFilter>(
          transactionId,
          filter,
        );
        const response =
          await rolePermissionUseCase.queryRolePermissions(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  rolePermissionsV1Router.post(
    "/",
    hasPermissions(["roles::update"]),
    validBody(rolePermissionBody, "createRolePermission"),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      const permissionId = toId(
        (req.body as { permissionId?: unknown })?.permissionId,
      );
      return roleId && permissionId
        ? { kind: "add-permission", roleId, permissionId }
        : null;
    }),
    async (req: Request<{ roleId: string }>, res) => {
      const transactionId = "createRolePermission";
      const roleId = req.params.roleId;
      const { permissionId } = req.body as { permissionId?: string };
      try {
        if (
          !roleId ||
          Number.isNaN(Number(roleId)) ||
          !permissionId ||
          Number.isNaN(Number(permissionId))
        ) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "roleId and permissionId are required.",
              ),
            );
        }

        const rolePermission: RolePermission = new RolePermission(
          Number.parseInt(roleId, 10),
          Number.parseInt(permissionId, 10),
        );

        const request = new RequestModel<RolePermission>(
          transactionId,
          rolePermission,
          actorOf(req),
        );
        const response =
          await rolePermissionUseCase.createRolePermission(request);

        const status = response.errorCode
          ? mapDomainErrorToHttpStatus(response.errorCode)
          : HttpStatusCodes.CREATED;
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  rolePermissionsV1Router.delete(
    "/:permissionId",
    hasPermissions(["roles::update"]),
    requireAccess(accessGuard, (req) => {
      const roleId = toId(req.params.roleId);
      const permissionId = toId(req.params.permissionId);
      return roleId && permissionId
        ? { kind: "remove-permission", roleId, permissionId }
        : null;
    }),
    async (req: Request<{ roleId: string; permissionId: string }>, res) => {
      const transactionId = "deleteRolePermission";
      const { roleId, permissionId } = req.params;
      try {
        if (
          !roleId ||
          Number.isNaN(Number(roleId)) ||
          !permissionId ||
          Number.isNaN(Number(permissionId))
        ) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "roleId and permissionId are required.",
              ),
            );
        }

        const rolePermission: RolePermission = new RolePermission(
          Number.parseInt(roleId, 10),
          Number.parseInt(permissionId, 10),
        );

        const request = new RequestModel<RolePermission>(
          transactionId,
          rolePermission,
          actorOf(req),
        );
        const response =
          await rolePermissionUseCase.deleteRolePermission(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return rolePermissionsV1Router;
}
