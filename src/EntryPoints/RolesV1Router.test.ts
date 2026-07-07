import express from "express";
import supertest from "supertest";
import rolesV1Router from "./RolesV1Router";
import { RolesUseCases } from "@src/Domain/Role/RoleUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Role } from "@src/Domain/Role/Entity/Role";

// Mock dependencies
jest.mock("@src/Domain/Role/RoleUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

describe("RolesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/roles", rolesV1Router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/roles", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryRoles").withResponse([]);
      (RolesUseCases.prototype.queryRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles").query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolesUseCases.prototype.queryRoles).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryRoles").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Query failed",
      );
      (RolesUseCases.prototype.queryRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (RolesUseCases.prototype.queryRoles as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/roles");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /v1/roles", () => {
    it("should return 201 on success", async () => {
      const mockRole = new Role(1, "test::role");
      const expectedResponse = new ResponseModel("createRole").withResponse(mockRole);
      (RolesUseCases.prototype.createRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/roles").send({ name: "test::role" });

      expect(response.status).toBe(HttpStatusCodes.CREATED);
      expect(RolesUseCases.prototype.createRole).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).post("/v1/roles").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createRole").withError(
        HttpStatusCodes.CONFLICT.toString(),
        "Conflict",
      );
      (RolesUseCases.prototype.createRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/roles").send({ name: "conflict" });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (RolesUseCases.prototype.createRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/roles").send({ name: "exception" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("DELETE /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deleteRole").withResponse(null);
      (RolesUseCases.prototype.deleteRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolesUseCases.prototype.deleteRole).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).delete("/v1/roles/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when delete fails", async () => {
      const expectedResponse = new ResponseModel("deleteRole").withError(
        HttpStatusCodes.NOT_FOUND.toString(),
        "Not found",
      );
      (RolesUseCases.prototype.deleteRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (RolesUseCases.prototype.deleteRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const mockRole = new Role(123, "test::role");
      const expectedResponse = new ResponseModel("queryRoleById").withResponse(mockRole);
      (RolesUseCases.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolesUseCases.prototype.queryById).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).get("/v1/roles/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when queryById fails", async () => {
      const expectedResponse = new ResponseModel("queryRoleById").withError(
        HttpStatusCodes.NOT_FOUND.toString(),
        "Not found",
      );
      (RolesUseCases.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when queryById throws an exception", async () => {
      (RolesUseCases.prototype.queryById as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/roles/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const mockRole = new Role(123, "updated::role");
      const expectedResponse = new ResponseModel("updateRole").withResponse(mockRole);
      (RolesUseCases.prototype.updateRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/roles/123").send({ name: "updated::role" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RolesUseCases.prototype.updateRole).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).put("/v1/roles/invalid-id").send({ name: "test" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when name is missing", async () => {
      const response = await supertest(app).put("/v1/roles/123").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when update fails", async () => {
      const expectedResponse = new ResponseModel("updateRole").withError(
        HttpStatusCodes.NOT_FOUND.toString(),
        "Not found",
      );
      (RolesUseCases.prototype.updateRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/roles/123").send({ name: "test" });

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when update throws an exception", async () => {
      (RolesUseCases.prototype.updateRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/roles/123").send({ name: "test" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
