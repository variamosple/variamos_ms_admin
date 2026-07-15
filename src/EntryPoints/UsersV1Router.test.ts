import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express, { Request, Response, NextFunction } from "express";
import supertest from "supertest";
import { createUsersRouter } from "./UsersV1Router";
import { UserQueryUseCase } from "@src/Domain/User/UseCase/UserQueryUseCase";
import { UserPasswordUseCase } from "@src/Domain/User/UseCase/UserPasswordUseCase";
import { UserManagementUseCase } from "@src/Domain/User/UseCase/UserManagementUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { User } from "@src/Domain/User/Entity/User";

import { mock } from "jest-mock-extended";

jest.mock("@src/Domain/User/UseCase/UserQueryUseCase");
jest.mock("@src/Domain/User/UseCase/UserPasswordUseCase");
jest.mock("@src/Domain/User/UseCase/UserManagementUseCase");

interface CustomRequest {
  user?: { id: string };
}

const mockHasPermissions = jest.fn().mockImplementation((_permissions: string[]) => {
  return (req: Request & CustomRequest, _res: Response, next: NextFunction) => {
    req.user = {
      id: "admin-id",
      name: "Admin User",
      email: "admin@example.com",
      user: "admin",
    };
    next();
  };
});

// Mock the hasPermissions middleware from security
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: (permissions: string[]) => mockHasPermissions(permissions),
}));

interface TestApiResponse<T> {
  data: T;
  message?: string;
  recoveryUrl?: string;
}

import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { UserPasswordUseCaseConfig } from "@src/Domain/User/UseCase/UserPasswordUseCase";

describe("UsersV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;
  let permissionsCalls: string[][][];

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockUserQueryUseCase = new UserQueryUseCase(mock<IUserRepository>());
    const mockUserPasswordUseCase = new UserPasswordUseCase(
      mock<IUserRepository>(),
      mock<IMailService>(),
      mock<UserPasswordUseCaseConfig>(),
    );
    const mockUserManagementUseCase = new UserManagementUseCase(mock<IUserRepository>());
    const mockUserRolesRouter = express.Router();
    app.use(
      "/v1/users",
      createUsersRouter(
        mockUserQueryUseCase,
        mockUserPasswordUseCase,
        mockUserManagementUseCase,
        mockUserRolesRouter,
      ),
    );
    permissionsCalls = [...mockHasPermissions.mock.calls];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Route Permissions", () => {
    it("should register routes with correct permissions", () => {
      expect(permissionsCalls).toEqual([
        [["users::query"]],
        [["users::query"]],
        [["users::update"]],
        [["users::update"]],
        [["users::update"]],
        [["users::delete"]],
      ]);
    });
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

      (UserQueryUseCase.prototype.queryList as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users").query({ pageNumber: 1, pageSize: 10 });

      const body = response.body as TestApiResponse<User[]>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserQueryUseCase.prototype.queryList).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUsers" }),
      );
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe("1");
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryUsers").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid query",
      );
      (UserQueryUseCase.prototype.queryList as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(UserQueryUseCase.prototype.queryList).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUsers" }),
      );
    });

    it("should return 500 when query fails with database exception", async () => {
      (UserQueryUseCase.prototype.queryList as jest.Mock).mockRejectedValue(
        new Error("Database Error"),
      );

      const response = await supertest(app).get("/v1/users");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserQueryUseCase.prototype.queryList).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUsers" }),
      );
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

      (UserQueryUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/123");

      const body = response.body as TestApiResponse<User>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserQueryUseCase.prototype.queryById).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUserById" }),
      );
      expect(body.data.id).toBe("123");
    });

    it("should return error status code when queryById fails", async () => {
      const expectedResponse = new ResponseModel("queryUserById").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      );
      (UserQueryUseCase.prototype.queryById as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      expect(UserQueryUseCase.prototype.queryById).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUserById" }),
      );
    });

    it("should return 500 when queryById throws exception", async () => {
      (UserQueryUseCase.prototype.queryById as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserQueryUseCase.prototype.queryById).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "queryUserById" }),
      );
    });
  });

  describe("POST /v1/users/:userId/recovery-link", () => {
    it("should return 200 and recoveryUrl", async () => {
      const expectedResponse = new ResponseModel(
        "generateRecoveryLink",
        undefined,
        "Success",
      ).withResponse({ recoveryUrl: "http://localhost:3000/#/reset-password?token=some-token" });

      (UserPasswordUseCase.prototype.generateLink as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      const body = response.body as TestApiResponse<{ recoveryUrl: string }>;
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserPasswordUseCase.prototype.generateLink).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "generateRecoveryLink" }),
      );
      expect(body.data.recoveryUrl).toContain("reset-password?token=some-token");
    });

    it("should return error status code when generateRecoveryLink fails", async () => {
      const expectedResponse = new ResponseModel("generateRecoveryLink").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UserPasswordUseCase.prototype.generateLink as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      expect(UserPasswordUseCase.prototype.generateLink).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "generateRecoveryLink" }),
      );
    });

    it("should return 500 when generateRecoveryLink throws exception", async () => {
      (UserPasswordUseCase.prototype.generateLink as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/users/123/recovery-link");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserPasswordUseCase.prototype.generateLink).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "generateRecoveryLink" }),
      );
    });
  });

  describe("PUT /v1/users/:userId/disable", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "disableUser",
        undefined,
        "User disabled",
      ).withResponse(null);

      (UserManagementUseCase.prototype.disable as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserManagementUseCase.prototype.disable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "disableUser" }),
      );
    });

    it("should return error status code when disableUser fails", async () => {
      const expectedResponse = new ResponseModel("disableUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UserManagementUseCase.prototype.disable as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      expect(UserManagementUseCase.prototype.disable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "disableUser" }),
      );
    });

    it("should return 500 when disableUser throws exception", async () => {
      (UserManagementUseCase.prototype.disable as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/users/123/disable");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserManagementUseCase.prototype.disable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "disableUser" }),
      );
    });
  });

  describe("PUT /v1/users/:userId/enable", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "enableUser",
        undefined,
        "User enabled",
      ).withResponse(null);

      (UserManagementUseCase.prototype.enable as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserManagementUseCase.prototype.enable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "enableUser" }),
      );
    });

    it("should return error status code when enableUser fails", async () => {
      const expectedResponse = new ResponseModel("enableUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UserManagementUseCase.prototype.enable as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      expect(UserManagementUseCase.prototype.enable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "enableUser" }),
      );
    });

    it("should return 500 when enableUser throws exception", async () => {
      (UserManagementUseCase.prototype.enable as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/users/123/enable");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserManagementUseCase.prototype.enable).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "enableUser" }),
      );
    });
  });

  describe("DELETE /v1/users/:userId", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "deleteUser",
        undefined,
        "User deleted",
      ).withResponse(null);

      (UserManagementUseCase.prototype.delete as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserManagementUseCase.prototype.delete).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "deleteUser" }),
      );
    });

    it("should return error status code when deleteUser fails", async () => {
      const expectedResponse = new ResponseModel("deleteUser").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found",
      );
      (UserManagementUseCase.prototype.delete as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      expect(UserManagementUseCase.prototype.delete).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "deleteUser" }),
      );
    });

    it("should return 500 when deleteUser throws exception", async () => {
      (UserManagementUseCase.prototype.delete as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).delete("/v1/users/123");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(UserManagementUseCase.prototype.delete).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "deleteUser" }),
      );
    });
  });
});
