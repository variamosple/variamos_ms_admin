import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createRolePermissionsRouter } from "./RolePermissionsV1Router";
import { RolePermissionUseCase } from "@src/Domain/Role/UseCase/RolePermissionUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/Role/UseCase/RolePermissionUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      next();
    },
}));

import { IRolePermissionRepository } from "@src/Domain/Role/Repository/IRolePermissionRepository";

describe("RolePermissionsV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockRolePermissionUseCase = new RolePermissionUseCase(mock<IRolePermissionRepository>());
    app.use(
      "/v1/roles/:roleId/permissions",
      createRolePermissionsRouter(mockRolePermissionUseCase),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/roles/:roleId/permissions", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryRolePermissions").withResponse([]);
      (RolePermissionUseCase.prototype.queryRolePermissions as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/roles/1/permissions")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolePermissionUseCase.prototype.queryRolePermissions).toHaveBeenCalledTimes(1);
      expect(RolePermissionUseCase.prototype.queryRolePermissions).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "queryRolePermissions" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).get("/v1/roles/invalid-id/permissions");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryRolePermissions").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (RolePermissionUseCase.prototype.queryRolePermissions as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/roles/1/permissions");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (RolePermissionUseCase.prototype.queryRolePermissions as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/roles/1/permissions");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "queryRolePermissions" }),
      );
    });
  });

  describe("POST /v1/roles/:roleId/permissions", () => {
    it("should return 201 on success", async () => {
      const mockRolePerm = new RolePermission(1, 2);
      const expectedResponse = new ResponseModel("createRolePermission").withResponse(mockRolePerm);
      (RolePermissionUseCase.prototype.createRolePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/v1/roles/1/permissions")
        .send({ permissionId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CREATED);
      expect(RolePermissionUseCase.prototype.createRolePermission).toHaveBeenCalledTimes(1);
      expect(RolePermissionUseCase.prototype.createRolePermission).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "createRolePermission" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app)
        .post("/v1/roles/invalid-id/permissions")
        .send({ permissionId: 2 });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when permissionId is missing or invalid", async () => {
      const response = await supertest(app).post("/v1/roles/1/permissions").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createRolePermission").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Already exists",
      );
      (RolePermissionUseCase.prototype.createRolePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/v1/roles/1/permissions")
        .send({ permissionId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (RolePermissionUseCase.prototype.createRolePermission as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/v1/roles/1/permissions")
        .send({ permissionId: 2 });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "createRolePermission" }),
      );
    });
  });

  describe("DELETE /v1/roles/:roleId/permissions/:permissionId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deleteRolePermission").withResponse(null);
      (RolePermissionUseCase.prototype.deleteRolePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).delete("/v1/roles/1/permissions/2");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolePermissionUseCase.prototype.deleteRolePermission).toHaveBeenCalledTimes(1);
      expect(RolePermissionUseCase.prototype.deleteRolePermission).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "deleteRolePermission" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).delete("/v1/roles/invalid-id/permissions/2");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when permissionId is invalid", async () => {
      const response = await supertest(app).delete("/v1/roles/1/permissions/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when delete fails", async () => {
      const expectedResponse = new ResponseModel("deleteRolePermission").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (RolePermissionUseCase.prototype.deleteRolePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).delete("/v1/roles/1/permissions/2");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (RolePermissionUseCase.prototype.deleteRolePermission as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/roles/1/permissions/2");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "deleteRolePermission" }),
      );
    });
  });
});
