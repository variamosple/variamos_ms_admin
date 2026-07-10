import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createUsersRouter } from "./UsersV1Router";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { User } from "@src/Domain/User/Entity/User";

import { mock } from "jest-mock-extended";

jest.mock("@src/Domain/User/UserUseCases");

interface CustomRequest {
  user?: { id: string };
}

// Mock the hasPermissions middleware from security
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: unknown, _res: unknown, next: () => void) => {
    (req as CustomRequest).user = { id: "admin-id" }; // Mock admin user for generateRecoveryLink
    next();
  },
}));

interface TestApiResponse<T> {
  data: T;
  message?: string;
  recoveryUrl?: string;
}

import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";
import { UserUseCasesConfig } from "@src/Domain/User/UserUseCases";

describe("UsersV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockUsersUseCases = new UsersUseCases(
      mock<IUserRepository>(),
      mock<IMailService>(),
      mock<IGuestRoleRepository>(),
      mock<UserUseCasesConfig>(),
    );
    const mockUserRolesRouter = express.Router();
    app.use("/v1/users", createUsersRouter(mockUsersUseCases, mockUserRolesRouter));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/users", () => {
    it("should return 200 and list of users on success", async () => {
      const mockUsers = [
        User.builder().setId("1").setName("User One").setEmail("one@example.com").build(),
        User.builder().setId("2").setName("User Two").setEmail("two@example.com").build(),
      ];
      const expectedResponse = new ResponseModel("queryUsers", undefined, "Success").withResponse(
        mockUsers,
      );

      (UsersUseCases.prototype.queryUsers as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users").query({ pageNumber: 1, pageSize: 10 });

      const body = response.body as TestApiResponse<User[]>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe("1");
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryUsers").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid query",
      );
      (UsersUseCases.prototype.queryUsers as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query fails with database exception", async () => {
      (UsersUseCases.prototype.queryUsers as jest.Mock).mockRejectedValue(
        new Error("Database Error"),
      );

      const response = await supertest(app).get("/v1/users");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/users/:userId", () => {
    it("should return 200 and the user detail", async () => {
      const mockUser = User.builder().setId("123").setName("John Doe").build();
      const expectedResponse = new ResponseModel(
        "queryUserById",
        undefined,
        "Success",
      ).withResponse(mockUser);

      (UsersUseCases.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/123");

      const body = response.body as TestApiResponse<User>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(body.data.id).toBe("123");
    });

    it("should return error status code when queryById fails", async () => {
      const expectedResponse = new ResponseModel("queryUserById").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (UsersUseCases.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when queryById throws exception", async () => {
      (UsersUseCases.prototype.queryById as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /v1/users/:userId/recovery-link", () => {
    it("should return 200 and recoveryUrl", async () => {
      const expectedResponse = new ResponseModel(
        "generateRecoveryLink",
        undefined,
        "Success",
      ).withResponse({ recoveryUrl: "http://localhost:3000/#/reset-password?token=some-token" });

      (UsersUseCases.prototype.generateRecoveryLink as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      const body = response.body as TestApiResponse<{ recoveryUrl: string }>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(body.data.recoveryUrl).toContain("reset-password?token=some-token");
    });

    it("should return error status code when generateRecoveryLink fails", async () => {
      const expectedResponse = new ResponseModel("generateRecoveryLink").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UsersUseCases.prototype.generateRecoveryLink as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when generateRecoveryLink throws exception", async () => {
      (UsersUseCases.prototype.generateRecoveryLink as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/users/:userId/disable", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "disableUser",
        undefined,
        "User disabled",
      ).withResponse(null);

      (UsersUseCases.prototype.disableUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return error status code when disableUser fails", async () => {
      const expectedResponse = new ResponseModel("disableUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UsersUseCases.prototype.disableUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when disableUser throws exception", async () => {
      (UsersUseCases.prototype.disableUser as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/users/:userId/enable", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "enableUser",
        undefined,
        "User enabled",
      ).withResponse(null);

      (UsersUseCases.prototype.enableUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return error status code when enableUser fails", async () => {
      const expectedResponse = new ResponseModel("enableUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UsersUseCases.prototype.enableUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when enableUser throws exception", async () => {
      (UsersUseCases.prototype.enableUser as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("DELETE /v1/users/:userId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "deleteUser",
        undefined,
        "User deleted",
      ).withResponse(null);

      (UsersUseCases.prototype.deleteUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return error status code when deleteUser fails", async () => {
      const expectedResponse = new ResponseModel("deleteUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UsersUseCases.prototype.deleteUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should return 500 when deleteUser throws exception", async () => {
      (UsersUseCases.prototype.deleteUser as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
