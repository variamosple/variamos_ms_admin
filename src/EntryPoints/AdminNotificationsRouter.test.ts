import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import { RoleModel } from "@src/DataProviders/Role/Role.js";
import { UserModel } from "@src/DataProviders/User/User.js";
import { NotificationClientInstance } from "@src/Infrastructure/Notification/NotificationClient.js";
import express from "express";
import supertest from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminNotificationsRouter } from "./AdminNotificationsRouter.js";

// Mock security permission helper
vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      next();
    },
}));

// Mock Sequelize Models
vi.mock("@src/DataProviders/User/User.js", () => ({
  UserModel: {
    findAll: vi.fn(),
  },
}));

vi.mock("@src/DataProviders/Role/Role.js", () => ({
  RoleModel: {
    findAll: vi.fn(),
  },
}));

// Mock Notification Client
vi.mock("@src/Infrastructure/Notification/NotificationClient.js", () => ({
  NotificationClientInstance: {
    dispatchNotification: vi.fn(),
  },
}));

describe("AdminNotificationsRouter Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Simulate req.user for express
    app.use((req, _res, next) => {
      req.user = { id: "admin-user-id" };
      next();
    });
    app.use("/v1/admin/notifications", createAdminNotificationsRouter());
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/admin/notifications/dispatch", () => {
    it("should return 400 if title or body is missing", async () => {
      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "broadcast",
          body: "Hello",
        });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.error).toBe("Title and body are required.");
    });

    it("should return 400 for role audience if roles array is empty", async () => {
      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "role",
          title: "System Alert",
          body: "Roles body",
          roles: [],
        });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.error).toBe(
        "At least one role is required for role audience.",
      );
    });

    it("should return 400 for users audience if userIds array is empty", async () => {
      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "users",
          title: "Alert",
          body: "Users body",
          userIds: [],
        });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.error).toBe(
        "At least one user ID is required for users audience.",
      );
    });

    it("should dispatch to all users when audience is broadcast", async () => {
      const mockUsers: Partial<UserModel>[] = [
        { id: "user-1" },
        { id: "user-2" },
      ];
      vi.mocked(UserModel.findAll).mockResolvedValue(mockUsers as UserModel[]);
      vi.mocked(
        NotificationClientInstance.dispatchNotification,
      ).mockResolvedValue(undefined);

      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "broadcast",
          title: "Broadcast Title",
          body: "Broadcast Body",
        });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.message).toBe(
        "Notification dispatched successfully.",
      );
      expect(UserModel.findAll).toHaveBeenCalled();
      expect(
        NotificationClientInstance.dispatchNotification,
      ).toHaveBeenCalledWith({
        recipients: {
          userIds: ["user-1", "user-2"],
        },
        templateKey: "admin_alert",
        variables: {
          title: "Broadcast Title",
          body: "Broadcast Body",
        },
        actorId: "admin-user-id",
      });
    });

    it("should resolve roles to user IDs and dispatch when audience is role", async () => {
      const mockRolesWithUsers: (Partial<RoleModel> & {
        users: Partial<UserModel>[];
      })[] = [
        {
          id: 1,
          name: "reviewer",
          users: [{ id: "user-1" }, { id: "user-3" }],
        },
      ];
      vi.mocked(RoleModel.findAll).mockResolvedValue(
        mockRolesWithUsers as RoleModel[],
      );
      vi.mocked(
        NotificationClientInstance.dispatchNotification,
      ).mockResolvedValue(undefined);

      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "role",
          title: "Role Title",
          body: "Role Body",
          roles: ["reviewer"],
        });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(RoleModel.findAll).toHaveBeenCalled();
      expect(
        NotificationClientInstance.dispatchNotification,
      ).toHaveBeenCalledWith({
        recipients: {
          userIds: ["user-1", "user-3"],
        },
        templateKey: "admin_alert",
        variables: {
          title: "Role Title",
          body: "Role Body",
        },
        actorId: "admin-user-id",
      });
    });

    it("should dispatch to specified userIds when audience is users", async () => {
      vi.mocked(
        NotificationClientInstance.dispatchNotification,
      ).mockResolvedValue(undefined);

      const response = await supertest(app)
        .post("/v1/admin/notifications/dispatch")
        .send({
          audience: "users",
          title: "User Title",
          body: "User Body",
          userIds: ["user-1"],
        });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        NotificationClientInstance.dispatchNotification,
      ).toHaveBeenCalledWith({
        recipients: {
          userIds: ["user-1"],
        },
        templateKey: "admin_alert",
        variables: {
          title: "User Title",
          body: "User Body",
        },
        actorId: "admin-user-id",
      });
    });
  });
});
