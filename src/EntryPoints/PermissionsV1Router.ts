import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import { PermissionsUseCases } from "@src/Domain/Permission/PermissionUseCases";
import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

export const PERMISSIONS_V1_ROUTE = "/v1/permissions";

export function createPermissionsRouter(permissionsUseCases: PermissionsUseCases): Router {
  const permissionsV1Router = Router();

  permissionsV1Router.get("/", hasPermissions(["permissions::query"]), async (req, res) => {
    const transactionId = "queryPermissions";
    const { pageNumber, pageSize, name = null } = req.query;
    try {
      const filter: PermissionFilter = PermissionFilter.builder()
        .setName(name as string)
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .build();

      const request = new RequestModel<PermissionFilter>(transactionId, filter);
      const response = await permissionsUseCases.queryPermissions(request);

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

  permissionsV1Router.post("/", hasPermissions(["permissions::create"]), async (req, res) => {
    const transactionId = "createPermission";
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

      let permission: Permission;
      try {
        permission = new Permission(null, name);
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

      const request = new RequestModel<Permission>(transactionId, permission);
      const response = await permissionsUseCases.createPermission(request);

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

  permissionsV1Router.delete(
    "/:permissionId",
    hasPermissions(["permissions::delete"]),
    async (req, res) => {
      const transactionId = "deletePermission";
      const permissionId = req.params.permissionId;
      try {
        if (!permissionId || Number.isNaN(+permissionId)) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "permissionId is required.",
              ),
            );
        }

        const request = new RequestModel<number>(transactionId, +permissionId);
        const response = await permissionsUseCases.deletePermission(request);

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

  permissionsV1Router.get(
    "/:permissionId",
    hasPermissions(["permissions::query"]),
    async (req, res) => {
      const transactionId = "queryPermissionById";
      const permissionId = req.params.permissionId;

      try {
        if (!permissionId || Number.isNaN(+permissionId)) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "permissionId is required.",
              ),
            );
        }

        const request = new RequestModel<number>(transactionId, Number.parseInt(permissionId));
        const response = await permissionsUseCases.queryById(request);

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

  permissionsV1Router.put(
    "/:permissionId",
    hasPermissions(["permissions::update"]),
    async (req, res) => {
      const transactionId = "updatePermission";
      const permissionId = req.params.permissionId;
      const { name } = req.body as { name?: string };
      try {
        if (!permissionId || Number.isNaN(+permissionId)) {
          return res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "permissionId is required.",
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

        let permission: Permission;
        try {
          permission = new Permission(Number.parseInt(permissionId), name);
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

        const request = new RequestModel<Permission>(transactionId, permission);
        const response = await permissionsUseCases.updatePermission(request);

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

  return permissionsV1Router;
}
