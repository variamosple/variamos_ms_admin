import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { RolesUseCases } from "@src/Domain/Role/RoleUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

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

export default rolesV1Router;
