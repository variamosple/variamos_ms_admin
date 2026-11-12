import { hasPermissions } from "@variamosple/variamos-security";
import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import { PermissionFilter } from "#src/Domain/Permission/Entity/PermissionFilter.js";
import type { PermissionUseCase } from "#src/Domain/Permission/UseCase/PermissionUseCase.js";
import { actorOf } from "./actor.js";
import { nameBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { queryText } from "./queryText.js";
import { checkedBody, validBody } from "./requestBody.js";

export const PERMISSIONS_V1_ROUTE = "/v1/permissions";

/** Answers 400 with the reason, for a request the routes refuse. */
const refuse = (res: Response, transactionId: string, reason: string) => {
  res
    .status(HttpStatusCodes.BAD_REQUEST)
    .json(
      new ResponseModel<void>(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        reason,
      ),
    );
};

/** The permission id of the path, or null once the refusal is sent. */
const permissionIdOf = (
  req: Request<{ permissionId: string }>,
  res: Response,
  transactionId: string,
): number | null => {
  const { permissionId } = req.params;
  if (!permissionId || Number.isNaN(Number(permissionId))) {
    refuse(res, transactionId, "permissionId is required.");
    return null;
  }
  return Number.parseInt(permissionId, 10);
};

const queryPermissions =
  (permissionUseCase: PermissionUseCase): RequestHandler =>
  async (req, res) => {
    const transactionId = "queryPermissions";
    const { pageNumber, pageSize, name = null, sortBy, sortOrder } = req.query;
    try {
      const filter: PermissionFilter = PermissionFilter.builder()
        .setName(queryText(name))
        .setPageNumber(Number(pageNumber))
        .setPageSize(Number(pageSize))
        .setSort(sortBy, sortOrder)
        .build();

      const request = new RequestModel<PermissionFilter>(transactionId, filter);
      const response = await permissionUseCase.queryPermissions(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const createPermission =
  (permissionUseCase: PermissionUseCase): RequestHandler =>
  async (req, res) => {
    const transactionId = "createPermission";
    const { name } = checkedBody(nameBody, req);
    try {
      if (!name) {
        refuse(res, transactionId, "name is required.");
        return;
      }

      let permission: Permission;
      try {
        permission = new Permission(null, name);
      } catch (error) {
        refuse(res, transactionId, errorMessage(error));
        return;
      }

      const request = new RequestModel<Permission>(
        transactionId,
        permission,
        actorOf(req),
      );
      const response = await permissionUseCase.createPermission(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const deletePermission =
  (
    permissionUseCase: PermissionUseCase,
  ): RequestHandler<{ permissionId: string }> =>
  async (req: Request<{ permissionId: string }>, res) => {
    const transactionId = "deletePermission";
    const permissionId = permissionIdOf(req, res, transactionId);
    if (permissionId === null) return;
    try {
      const request = new RequestModel<number>(
        transactionId,
        permissionId,
        actorOf(req),
      );
      const response = await permissionUseCase.deletePermission(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryPermissionById =
  (
    permissionUseCase: PermissionUseCase,
  ): RequestHandler<{ permissionId: string }> =>
  async (req: Request<{ permissionId: string }>, res) => {
    const transactionId = "queryPermissionById";
    const permissionId = permissionIdOf(req, res, transactionId);
    if (permissionId === null) return;
    try {
      const request = new RequestModel<number>(transactionId, permissionId);
      const response = await permissionUseCase.queryById(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const updatePermission =
  (
    permissionUseCase: PermissionUseCase,
  ): RequestHandler<{ permissionId: string }> =>
  async (req: Request<{ permissionId: string }>, res) => {
    const transactionId = "updatePermission";
    const permissionId = permissionIdOf(req, res, transactionId);
    if (permissionId === null) return;
    const { name } = checkedBody(nameBody, req);
    try {
      if (!name) {
        refuse(res, transactionId, "name is required.");
        return;
      }

      let permission: Permission;
      try {
        permission = new Permission(permissionId, name);
      } catch (error) {
        refuse(res, transactionId, errorMessage(error));
        return;
      }

      const request = new RequestModel<Permission>(
        transactionId,
        permission,
        actorOf(req),
      );
      const response = await permissionUseCase.updatePermission(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

export function createPermissionsRouter(
  permissionUseCase: PermissionUseCase,
): Router {
  const permissionsV1Router = Router();

  permissionsV1Router.get(
    "/",
    hasPermissions(["permissions::query"]),
    queryPermissions(permissionUseCase),
  );

  permissionsV1Router.post(
    "/",
    hasPermissions(["permissions::create"]),
    validBody(nameBody, "createPermission"),
    createPermission(permissionUseCase),
  );

  permissionsV1Router.delete(
    "/:permissionId",
    hasPermissions(["permissions::delete"]),
    deletePermission(permissionUseCase),
  );

  permissionsV1Router.get(
    "/:permissionId",
    hasPermissions(["permissions::query"]),
    queryPermissionById(permissionUseCase),
  );

  permissionsV1Router.put(
    "/:permissionId",
    hasPermissions(["permissions::update"]),
    validBody(nameBody, "updatePermission"),
    updatePermission(permissionUseCase),
  );

  return permissionsV1Router;
}
