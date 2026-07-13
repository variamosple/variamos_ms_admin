import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createPermissionsRouter } from "./PermissionsV1Router";
import { PermissionUseCase } from "@src/Domain/Permission/UseCase/PermissionUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Permission } from "@src/Domain/Permission/Entity/Permission";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/Permission/UseCase/PermissionUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

import { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository";

describe("PermissionsV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockPermissionUseCase = new PermissionUseCase(mock<IPermissionRepository>());
    app.use("/v1/permissions", createPermissionsRouter(mockPermissionUseCase));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/permissions", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryPermissions").withResponse([]);
      (PermissionUseCase.prototype.queryPermissions as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/permissions")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(PermissionUseCase.prototype.queryPermissions).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryPermissions").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (PermissionUseCase.prototype.queryPermissions as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/permissions");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (PermissionUseCase.prototype.queryPermissions as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/permissions");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /v1/permissions", () => {
    it("should return 200 on success", async () => {
      const mockPerm = new Permission(1, "test::perm");
      const expectedResponse = new ResponseModel("createPermission").withResponse(mockPerm);
      (PermissionUseCase.prototype.createPermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).post("/v1/permissions").send({ name: "test::perm" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(PermissionUseCase.prototype.createPermission).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).post("/v1/permissions").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createPermission").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Conflict",
      );
      (PermissionUseCase.prototype.createPermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/v1/permissions")
        .send({ name: "users::conflict" });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (PermissionUseCase.prototype.createPermission as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/v1/permissions")
        .send({ name: "users::exception" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("DELETE /v1/permissions/:permissionId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deletePermission").withResponse(null);
      (PermissionUseCase.prototype.deletePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).delete("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(PermissionUseCase.prototype.deletePermission).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when permissionId is invalid", async () => {
      const response = await supertest(app).delete("/v1/permissions/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when delete fails", async () => {
      const expectedResponse = new ResponseModel("deletePermission").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (PermissionUseCase.prototype.deletePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).delete("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (PermissionUseCase.prototype.deletePermission as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/permissions/:permissionId", () => {
    it("should return 200 on success", async () => {
      const mockPerm = new Permission(123, "test::perm");
      const expectedResponse = new ResponseModel("queryPermissionById").withResponse(mockPerm);
      (PermissionUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(PermissionUseCase.prototype.queryById).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when permissionId is invalid", async () => {
      const response = await supertest(app).get("/v1/permissions/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when queryById fails", async () => {
      const expectedResponse = new ResponseModel("queryPermissionById").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (PermissionUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when queryById throws an exception", async () => {
      (PermissionUseCase.prototype.queryById as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/permissions/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/permissions/:permissionId", () => {
    it("should return 200 on success", async () => {
      const mockPerm = new Permission(123, "updated::perm");
      const expectedResponse = new ResponseModel("updatePermission").withResponse(mockPerm);
      (PermissionUseCase.prototype.updatePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .put("/v1/permissions/123")
        .send({ name: "updated::perm" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(PermissionUseCase.prototype.updatePermission).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when permissionId is invalid", async () => {
      const response = await supertest(app)
        .put("/v1/permissions/invalid-id")
        .send({ name: "test::perm" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).put("/v1/permissions/123").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when update fails", async () => {
      const expectedResponse = new ResponseModel("updatePermission").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (PermissionUseCase.prototype.updatePermission as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/permissions/123").send({ name: "test::perm" });

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when update throws an exception", async () => {
      (PermissionUseCase.prototype.updatePermission as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/permissions/123").send({ name: "test::perm" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
