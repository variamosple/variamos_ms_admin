import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission";
import { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter";
import { RolePermissionUseCases } from "@src/Domain/Role/RolePermissionUseCases";
import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

export const ROLE_PERMISSIONS_V1_ROUTE = "/:roleId/permissions";

export function createRolePermissionsRouter(
  rolePermissionUseCases: RolePermissionUseCases,
): Router {
  const rolePermissionsV1Router = Router({ mergeParams: true });

  rolePermissionsV1Router.get("/", hasPermissions(["roles::query"]), async (req, res) => {
    const transactionId = "queryRolePermissions";
    const { pageNumber, pageSize } = req.query;
    const roleId = req.params.roleId;
    try {
      if (!roleId || Number.isNaN(+roleId)) {
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
        .setRoleId(Number.parseInt(roleId))
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .build();

      const request = new RequestModel<RolePermissionFilter>(transactionId, filter);
      const response = await rolePermissionUseCases.queryRolePermissions(request);

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

  rolePermissionsV1Router.post("/", hasPermissions(["roles::update"]), async (req, res) => {
    const transactionId = "createRolePermission";
    const roleId = req.params.roleId;
    const { permissionId } = req.body as { permissionId?: string };
    try {
      if (!roleId || Number.isNaN(+roleId) || !permissionId || Number.isNaN(+permissionId)) {
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
        Number.parseInt(roleId),
        Number.parseInt(permissionId),
      );

      const request = new RequestModel<RolePermission>(transactionId, rolePermission);
      const response = await rolePermissionUseCases.createRolePermission(request);

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

  rolePermissionsV1Router.delete(
    "/:permissionId",
    hasPermissions(["roles::update"]),
    async (req, res) => {
      const transactionId = "deleteRolePermission";
      const { roleId, permissionId } = req.params;
      try {
        if (!roleId || Number.isNaN(+roleId) || !permissionId || Number.isNaN(+permissionId)) {
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
          Number.parseInt(roleId),
          Number.parseInt(permissionId),
        );

        const request = new RequestModel<RolePermission>(transactionId, rolePermission);
        const response = await rolePermissionUseCases.deleteRolePermission(request);

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
    },
  );

  return rolePermissionsV1Router;
}
