import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { RolesUseCases } from "@src/Domain/Role/RoleUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import rolePermissionsV1Router, {
  ROLE_PERMISSIONS_V1_ROUTE,
} from "./RolePermissionsV1Router";

export const ROLES_V1_ROUTE = "/v1/roles";

const rolesV1Router = Router();

rolesV1Router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "queryRoles";
  const { pageNumber, pageSize, name = null } = req.query;
  try {
    const filter: RoleFilter = RoleFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<RoleFilter>(transactionId, filter);
    const response = await new RolesUseCases().queryRoles(request);

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

rolesV1Router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createRole";
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

    const role: Role = new Role(null, name);

    const request = new RequestModel<Role>(transactionId, role);
    const response = await new RolesUseCases().createRole(request);

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

rolesV1Router.delete("/:roleId", isAuthenticated, async (req, res) => {
  const transactionId = "deleteRole";
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

    const request = new RequestModel<number>(transactionId, +roleId);
    const response = await new RolesUseCases().deleteRole(request);

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

rolesV1Router.get("/:roleId", isAuthenticated, async (req, res) => {
  const transactionId = "queryRoleById";
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

    const request = new RequestModel<number>(
      transactionId,
      Number.parseInt(roleId)
    );
    const response = await new RolesUseCases().queryById(request);

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

rolesV1Router.put("/:roleId", isAuthenticated, async (req, res) => {
  const transactionId = "updateRole";
  const roleId = req.params.roleId;
  const { name } = req.body;
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

    const permission: Role = new Role(Number.parseInt(roleId), name);

    const request = new RequestModel<Role>(transactionId, permission);
    const response = await new RolesUseCases().updateRole(request);

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

rolesV1Router.use(ROLE_PERMISSIONS_V1_ROUTE, rolePermissionsV1Router);

export default rolesV1Router;
