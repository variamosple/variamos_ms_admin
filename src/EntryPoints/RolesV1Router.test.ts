import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createRolesRouter } from "./RolesV1Router";
import { RoleQueryUseCase } from "@src/Domain/Role/UseCase/RoleQueryUseCase";
import { RoleManagementUseCase } from "@src/Domain/Role/UseCase/RoleManagementUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Role } from "@src/Domain/Role/Entity/Role";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/Role/UseCase/RoleQueryUseCase");
jest.mock("@src/Domain/Role/UseCase/RoleManagementUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      next();
    },
}));

import { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository";

describe("RolesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockRoleQueryUseCase = new RoleQueryUseCase(mock<IRoleRepository>());
    const mockRoleManagementUseCase = new RoleManagementUseCase(mock<IRoleRepository>());
    const mockRolePermissionsRouter = express.Router();
    app.use(
      "/v1/roles",
      createRolesRouter(mockRoleManagementUseCase, mockRoleQueryUseCase, mockRolePermissionsRouter),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/roles", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryRoles").withResponse([]);
      (RoleQueryUseCase.prototype.queryRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles").query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RoleQueryUseCase.prototype.queryRoles).toHaveBeenCalledTimes(1);
      expect(RoleQueryUseCase.prototype.queryRoles).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "queryRoles" }),
      );
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryRoles").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (RoleQueryUseCase.prototype.queryRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (RoleQueryUseCase.prototype.queryRoles as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/roles");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(expect.objectContaining({ transactionId: "queryRoles" }));
    });
  });

  describe("POST /v1/roles", () => {
    it("should return 201 on success", async () => {
      const mockRole = new Role(1, "Test role");
      const expectedResponse = new ResponseModel("createRole").withResponse(mockRole);
      (RoleManagementUseCase.prototype.createRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/roles").send({ name: "Test role" });

      expect(response.status).toBe(HttpStatusCodes.CREATED);
      expect(RoleManagementUseCase.prototype.createRole).toHaveBeenCalledTimes(1);
      expect(RoleManagementUseCase.prototype.createRole).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "createRole" }),
      );
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).post("/v1/roles").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createRole").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Conflict",
      );
      (RoleManagementUseCase.prototype.createRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/roles").send({ name: "Conflict" });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (RoleManagementUseCase.prototype.createRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/roles").send({ name: "Exception" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(expect.objectContaining({ transactionId: "createRole" }));
    });
  });

  describe("DELETE /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deleteRole").withResponse(null);
      (RoleManagementUseCase.prototype.deleteRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RoleManagementUseCase.prototype.deleteRole).toHaveBeenCalledTimes(1);
      expect(RoleManagementUseCase.prototype.deleteRole).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "deleteRole" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).delete("/v1/roles/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when delete fails", async () => {
      const expectedResponse = new ResponseModel("deleteRole").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (RoleManagementUseCase.prototype.deleteRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (RoleManagementUseCase.prototype.deleteRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(expect.objectContaining({ transactionId: "deleteRole" }));
    });
  });

  describe("GET /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const mockRole = new Role(123, "Test role");
      const expectedResponse = new ResponseModel("queryRoleById").withResponse(mockRole);
      (RoleQueryUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RoleQueryUseCase.prototype.queryById).toHaveBeenCalledTimes(1);
      expect(RoleQueryUseCase.prototype.queryById).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "queryRoleById" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).get("/v1/roles/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when queryById fails", async () => {
      const expectedResponse = new ResponseModel("queryRoleById").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (RoleQueryUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when queryById throws an exception", async () => {
      (RoleQueryUseCase.prototype.queryById as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(expect.objectContaining({ transactionId: "queryRoleById" }));
    });
  });

  describe("PUT /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const mockRole = new Role(123, "Updated role");
      const expectedResponse = new ResponseModel("updateRole").withResponse(mockRole);
      (RoleManagementUseCase.prototype.updateRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/roles/123").send({ name: "Updated role" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RoleManagementUseCase.prototype.updateRole).toHaveBeenCalledTimes(1);
      expect(RoleManagementUseCase.prototype.updateRole).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "updateRole" }),
      );
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).put("/v1/roles/invalid-id").send({ name: "Test" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).put("/v1/roles/123").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when update fails", async () => {
      const expectedResponse = new ResponseModel("updateRole").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (RoleManagementUseCase.prototype.updateRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/roles/123").send({ name: "Test" });

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when update throws an exception", async () => {
      (RoleManagementUseCase.prototype.updateRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/roles/123").send({ name: "Test" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(expect.objectContaining({ transactionId: "updateRole" }));
    });
  });
});
