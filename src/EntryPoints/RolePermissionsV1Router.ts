import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission";
import { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter";
import { RolePermissionUseCases } from "@src/Domain/Role/RolePermissionUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const ROLE_PERMISSIONS_V1_ROUTE = "/:roleId/permissions";

const rolePermissionsV1Router = Router({ mergeParams: true });

rolePermissionsV1Router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "queryRolePermissions";
  const { pageNumber, pageSize } = req.query;
  const roleId = req.params.roleId;
  try {
    if (!roleId || Number.isNaN(+roleId)) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "roleId is required."
          )
        );
    }

    const filter: RolePermissionFilter = RolePermissionFilter.builder()
      .setRoleId(Number.parseInt(roleId))
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<RolePermissionFilter>(
      transactionId,
      filter
    );
    const response = await new RolePermissionUseCases().queryRolePermissions(
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
});

rolePermissionsV1Router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createRolePermission";
  const roleId = req.params.roleId;
  const { permissionId } = req.body;
  try {
    if (
      !roleId ||
      Number.isNaN(+roleId) ||
      !permissionId ||
      Number.isNaN(+permissionId)
    ) {
      return res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "roleId and permissionId are required."
          )
        );
    }

    const rolePermission: RolePermission = new RolePermission(
      Number.parseInt(roleId),
      Number.parseInt(permissionId)
    );

    const request = new RequestModel<RolePermission>(
      transactionId,
      rolePermission
    );
    const response = await new RolePermissionUseCases().createRolePermission(
      request
    );

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
});

rolePermissionsV1Router.delete(
  "/:permissionId",
  isAuthenticated,
  async (req, res) => {
    const transactionId = "deleteRolePermission";
    const { roleId, permissionId } = req.params;
    try {
      if (
        !roleId ||
        Number.isNaN(+roleId) ||
        !permissionId ||
        Number.isNaN(+permissionId)
      ) {
        return res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json(
            new ResponseModel<unknown>(transactionId).withError(
              HttpStatusCodes.BAD_REQUEST,
              "roleId and permissionId are required."
            )
          );
      }

      const rolePermission: RolePermission = new RolePermission(
        Number.parseInt(roleId),
        Number.parseInt(permissionId)
      );

      const request = new RequestModel<RolePermission>(
        transactionId,
        rolePermission
      );
      const response = await new RolePermissionUseCases().deleteRolePermission(
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

export default rolePermissionsV1Router;
