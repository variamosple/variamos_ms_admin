/* eslint-disable @typescript-eslint/unbound-method */
import express from "express";
import supertest from "supertest";
import usersV1Router from "./UsersV1Router";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { User } from "@src/Domain/User/Entity/User";

jest.mock("@src/Domain/User/UserUseCases");

interface CustomRequest {
  user?: { id: string };
}

// Mock the hasPermissions middleware from security
jest.mock("@variamosple/variamos-security", () => ({
  // eslint-disable-next-line no-restricted-syntax
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

describe("UsersV1Router Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/users", usersV1Router);
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

      const mockQueryUsers = UsersUseCases.prototype.queryUsers as jest.Mock;
      expect(mockQueryUsers).toHaveBeenCalledTimes(1);
    });

    it("should return 500 when query fails", async () => {
      (UsersUseCases.prototype.queryUsers as jest.Mock).mockRejectedValue(
        new Error("Database Error"),
      );

      const response = await supertest(app).get("/v1/users");

      const body = response.body as TestApiResponse<null>;
      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe("Internal Server Error");
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

      const mockQueryById = UsersUseCases.prototype.queryById as jest.Mock;
      expect(mockQueryById).toHaveBeenCalledTimes(1);
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

      const mockGenRecovery = UsersUseCases.prototype.generateRecoveryLink as jest.Mock;
      expect(mockGenRecovery).toHaveBeenCalledTimes(1);
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

      const mockDisable = UsersUseCases.prototype.disableUser as jest.Mock;
      expect(mockDisable).toHaveBeenCalledTimes(1);
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

      const mockEnable = UsersUseCases.prototype.enableUser as jest.Mock;
      expect(mockEnable).toHaveBeenCalledTimes(1);
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

      const mockDelete = UsersUseCases.prototype.deleteUser as jest.Mock;
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
  });
});
