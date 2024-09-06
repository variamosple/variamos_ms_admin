import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import { PermissionsUseCases } from "@src/Domain/Permission/PermissionUseCases";
import { Router } from "express";
import logger from "jet-logger";

export const PERMISSIONS_V1_ROUTE = "/v1/permissions";

const permissionsV1Router = Router();

permissionsV1Router.get("/", async (req, res) => {
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

export default permissionsV1Router;
