import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createUserRolesRouter } from "./UserRolesV1Router";
import { UserRoleUseCase } from "@src/Domain/User/UseCase/UserRoleUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { UserRole } from "@src/Domain/User/Entity/UserRole";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/User/UseCase/UserRoleUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

import { IUserRoleRepository } from "@src/Domain/User/Repository/IUserRoleRepository";

describe("UserRolesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockUserRoleUseCase = new UserRoleUseCase(mock<IUserRoleRepository>());
    app.use("/v1/users/:userId/roles", createUserRolesRouter(mockUserRoleUseCase));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/users/:userId/roles", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryUserRoles").withResponse([]);
      (UserRoleUseCase.prototype.queryUserRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/users/user-123/roles")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCase.prototype.queryUserRoles).toHaveBeenCalledTimes(1);
      expect(UserRoleUseCase.prototype.queryUserRoles).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUserRoles" }),
      );
    });

    it("should return 400 when userId is missing", async () => {
      const response = await supertest(app)
        .get("/v1/users/user-123/roles")
        .set("x-test-no-user-id", "true");
      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryUserRoles").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (UserRoleUseCase.prototype.queryUserRoles as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/user-123/roles");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (UserRoleUseCase.prototype.queryUserRoles as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/users/user-123/roles");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/users/:userId/roles/details", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryUserRolesDetails").withResponse([]);
      (UserRoleUseCase.prototype.queryUserRolesDetails as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/users/user-123/roles/details")
        .query({ pageNumber: 1, pageSize: 10 });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCase.prototype.queryUserRolesDetails).toHaveBeenCalledTimes(1);
      expect(UserRoleUseCase.prototype.queryUserRolesDetails).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUserRolesDetails" }),
      );
    });

    it("should return 400 when userId is missing", async () => {
      const response = await supertest(app)
        .get("/v1/users/user-123/roles/details")
        .set("x-test-no-user-id", "true");
      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when query details fails", async () => {
      const expectedResponse = new ResponseModel("queryUserRolesDetails").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query details failed",
      );
      (UserRoleUseCase.prototype.queryUserRolesDetails as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/users/user-123/roles/details");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query details throws an exception", async () => {
      (UserRoleUseCase.prototype.queryUserRolesDetails as jest.Mock).mockRejectedValue(
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
      (UserRoleUseCase.prototype.createUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CREATED);
      expect(UserRoleUseCase.prototype.createUserRole).toHaveBeenCalledTimes(1);
      expect(UserRoleUseCase.prototype.createUserRole).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "createUserRole" }),
      );
    });

    it("should return 400 when roleId is missing or invalid", async () => {
      const response = await supertest(app).post("/v1/users/user-123/roles").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when userId is missing", async () => {
      const response = await supertest(app)
        .post("/v1/users/user-123/roles")
        .set("x-test-no-user-id", "true")
        .send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 when roleId is not a number", async () => {
      const response = await supertest(app)
        .post("/v1/users/user-123/roles")
        .send({ roleId: "abc" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when create fails", async () => {
      const expectedResponse = new ResponseModel("createUserRole").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Conflict",
      );
      (UserRoleUseCase.prototype.createUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    });

    it("should return 500 when create throws an exception", async () => {
      (UserRoleUseCase.prototype.createUserRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/users/user-123/roles").send({ roleId: 2 });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("DELETE /v1/users/:userId/roles/:roleId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("deleteUserRole").withResponse(null);
      (UserRoleUseCase.prototype.deleteUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserRoleUseCase.prototype.deleteUserRole).toHaveBeenCalledTimes(1);
      expect(UserRoleUseCase.prototype.deleteUserRole).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "deleteUserRole" }),
      );
    });

    it("should return 400 when userId is missing", async () => {
      const response = await supertest(app)
        .delete("/v1/users/user-123/roles/2")
        .set("x-test-no-user-id", "true");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
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
      (UserRoleUseCase.prototype.deleteUserRole as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when delete throws an exception", async () => {
      (UserRoleUseCase.prototype.deleteUserRole as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/users/user-123/roles/2");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
