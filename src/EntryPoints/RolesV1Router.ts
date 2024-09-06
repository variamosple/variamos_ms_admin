import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { RolesUseCases } from "@src/Domain/Role/RoleUseCases";
import { Router } from "express";
import logger from "jet-logger";

export const ROLES_V1_ROUTE = "/v1/roles";

const rolesV1Router = Router();

rolesV1Router.get("/", async (req, res) => {
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

export default rolesV1Router;
