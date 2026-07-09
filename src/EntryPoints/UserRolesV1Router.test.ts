import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import userRolesV1Router from "./UserRolesV1Router";
import { UserRoleUseCases } from "@src/Domain/User/UserRoleUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { UserRole } from "@src/Domain/User/Entity/UserRole";

// Mock dependencies
jest.mock("@src/Domain/User/UserRoleUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

describe("UserRolesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/users/:userId/roles", userRolesV1Router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/users/:userId/roles", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryUserRoles").withResponse([]);
      (UserRoleUseCases.prototype.queryUserRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/users/user-123/roles")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCases.prototype.queryUserRoles).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryUserRoles").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (UserRoleUseCases.prototype.queryUserRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/user-123/roles");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (UserRoleUseCases.prototype.queryUserRoles as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/users/user-123/roles");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/users/:userId/roles/details", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryUserRolesDetails").withResponse([]);
      (UserRoleUseCases.prototype.queryUserRolesDetails as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/users/user-123/roles/details")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCases.prototype.queryUserRolesDetails).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query details fails", async () => {
      const expectedResponse = new ResponseModel("queryUserRolesDetails").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query details failed",
      );
      (UserRoleUseCases.prototype.queryUserRolesDetails as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/users/user-123/roles/details");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query details throws an exception", async () => {
      (UserRoleUseCases.prototype.queryUserRolesDetails as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/users/user-123/roles/details");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /v1/users/:userId/roles", () => {
    it("should return 201 on success", async () => {
      const mockUserRole = new UserRole("user-123", 2);
      const expectedResponse = new ResponseModel("createUserRole").withResponse(mockUserRole);
      (UserRoleUseCases.prototype.createUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CREATED);
      expect(UserRoleUseCases.prototype.createUserRole).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when roleId is missing or invalid", async () => {
      const response = await supertest(app).post("/v1/users/user-123/roles").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createUserRole").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Conflict",
      );
      (UserRoleUseCases.prototype.createUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (UserRoleUseCases.prototype.createUserRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("DELETE /v1/users/:userId/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deleteUserRole").withResponse(null);
      (UserRoleUseCases.prototype.deleteUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCases.prototype.deleteUserRole).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when roleId is invalid", async () => {
      const response = await supertest(app).delete("/v1/users/user-123/roles/invalid-id");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when delete fails", async () => {
      const expectedResponse = new ResponseModel("deleteUserRole").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (UserRoleUseCases.prototype.deleteUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (UserRoleUseCases.prototype.deleteUserRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
