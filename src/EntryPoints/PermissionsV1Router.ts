import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import { PermissionsUseCases } from "@src/Domain/Permission/PermissionUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const PERMISSIONS_V1_ROUTE = "/v1/permissions";

const permissionsV1Router = Router();

permissionsV1Router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "queryPermissions";
  const { pageNumber, pageSize, name = null } = req.query;
  try {
    const filter: PermissionFilter = PermissionFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<PermissionFilter>(transactionId, filter);
    const response = await new PermissionsUseCases().queryPermissions(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

permissionsV1Router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createPermission";
  const { name } = req.body;
  try {
    if (!name) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "name is required."
          )
        );
    }

    const permission: Permission = new Permission(null, name);

    const request = new RequestModel<Permission>(transactionId, permission);
    const response = await new PermissionsUseCases().createPermission(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

permissionsV1Router.delete(
  "/:permissionId",
  isAuthenticated,
  async (req, res) => {
    const transactionId = "deletePermission";
    const permissionId = req.params.permissionId;
    try {
      if (!permissionId || Number.isNaN(+permissionId)) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "permissionId is required."
            )
          );
      }

      const request = new RequestModel<number>(transactionId, +permissionId);
      const response = await new PermissionsUseCases().deletePermission(
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

permissionsV1Router.get("/:permissionId", isAuthenticated, async (req, res) => {
  const transactionId = "queryPermissionById";
  const permissionId = req.params.permissionId;

  try {
    if (!permissionId || Number.isNaN(+permissionId)) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "permissionId is required."
          )
        );
    }

    const request = new RequestModel<number>(
      transactionId,
      Number.parseInt(permissionId)
    );
    const response = await new PermissionsUseCases().queryById(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

permissionsV1Router.put("/:permissionId", isAuthenticated, async (req, res) => {
  const transactionId = "updatePermission";
  const permissionId = req.params.permissionId;
  const { name } = req.body;
  try {
    if (!permissionId || Number.isNaN(+permissionId)) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "permissionId is required."
          )
        );
    }

    if (!name) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "name is required."
          )
        );
    }

    const permission: Permission = new Permission(
      Number.parseInt(permissionId),
      name
    );

    const request = new RequestModel<Permission>(transactionId, permission);
    const response = await new PermissionsUseCases().updatePermission(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

export default permissionsV1Router;
