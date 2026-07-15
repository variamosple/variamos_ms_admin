import { mock } from "jest-mock-extended";
const mockValidateSession = jest.fn();

jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as { user?: { id: string; email?: string } }).user = {
      id: "admin-123",
      email: "admin@example.com",
    };
    next();
  },
  hasPermissions:
    () => (req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  isLogged: () => (req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  checkSession: () => (req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  validateSession: (token: string) => mockValidateSession(token),
}));

import request from "supertest";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { BugNote } from "@src/Domain/Bug/Entity/BugNote";
import { BugStatusLog } from "@src/Domain/Bug/Entity/BugStatusLog";
import { BugAttachment } from "@src/Domain/Bug/Entity/BugAttachment";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { createBugRouter } from "./BugRouter";
import { BugSubmissionUseCase } from "@src/Domain/Bug/UseCase/BugSubmissionUseCase";
import { BugLifecycleUseCase } from "@src/Domain/Bug/UseCase/BugLifecycleUseCase";
import { BugSyncUseCase } from "@src/Domain/Bug/UseCase/BugSyncUseCase";
import { BugQueryUseCase } from "@src/Domain/Bug/UseCase/BugQueryUseCase";
import { BugAttachmentUseCase } from "@src/Domain/Bug/UseCase/BugAttachmentUseCase";
import multer from "multer";
import logger from "jet-logger";

const mockLoggerInfo = jest.spyOn(logger, "info").mockImplementation();
const mockLoggerErr = jest.spyOn(logger, "err").mockImplementation();

const mockBugSubmissionUseCase = mock<BugSubmissionUseCase>();
const mockBugLifecycleUseCase = mock<BugLifecycleUseCase>();
const mockBugSyncUseCase = mock<BugSyncUseCase>();
const mockBugQueryUseCase = mock<BugQueryUseCase>();
const mockBugAttachmentUseCase = mock<BugAttachmentUseCase>();

// Use memory storage for testing to bypass physical disk writes and keep tests clean
const mockUpload = multer({ storage: multer.memoryStorage() });
const mockAuth: RequestHandler = (req, res, next) => {
  (req as { user?: { id: string; email?: string } }).user = {
    id: "admin-123",
    email: "admin@example.com",
  };
  next();
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as { user?: { id: string; email?: string } }).user = {
    id: "admin-123",
    email: "admin@example.com",
  };
  next();
});
app.use(
  "/bugs",
  createBugRouter(
    mockBugSubmissionUseCase,
    mockBugLifecycleUseCase,
    mockBugSyncUseCase,
    mockBugQueryUseCase,
    mockBugAttachmentUseCase,
    mockUpload,
    mockAuth,
  ),
);

describe("BugRouter HTTP Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return 200 and bug list on success", async () => {
      const mockBugs = [
        Bug.builder().setId("gh-1").setTitle("GitHub Issue 1").setStatus("open").build(),
      ];
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse(mockBugs),
      );

      const res = await request(app)
        .get("/bugs")
        .query({ repo: "VariaMos/VariaMosAdmin", status: "open" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe("gh-1");
      expect(mockBugQueryUseCase.queryBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "queryBugs",
        }),
      );
    });

    it("should map domain error codes to correct HTTP error codes", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withError(
          DomainErrorCodes.INVALID_INPUT,
          "Invalid repository format",
        ),
      );

      const res = await request(app).get("/bugs").query({ repo: "invalid-repo" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid repository format");
    });
  });

  describe("GET /bugs/local", () => {
    it("should fetch local inbox bugs successfully", async () => {
      const localBugs = [
        Bug.builder().setId("local-1").setTitle("Local Bug 1").setStatus("pending").build(),
      ];
      mockBugQueryUseCase.queryLocalBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse(localBugs),
      );

      const res = await request(app).get("/bugs/local").query({ status: "pending" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe("local-1");
      expect(mockBugQueryUseCase.queryLocalBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "queryLocalBugs",
        }),
      );
    });
  });

  describe("POST /bugs/:id/reject", () => {
    it("should successfully reject a local bug", async () => {
      const rejectedBug = Bug.builder().setId("local-1").setStatus("rejected").build();
      mockBugLifecycleUseCase.rejectBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(rejectedBug),
      );

      const res = await request(app).post("/bugs/local-1/reject").send();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("rejected");
      expect(mockBugLifecycleUseCase.rejectBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "rejectBug",
          data: { id: "local-1", adminId: "admin-123" },
        }),
      );
    });

    it("should return 404 if bug is not found", async () => {
      mockBugLifecycleUseCase.rejectBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "Local bug not found.",
        ),
      );

      const res = await request(app).post("/bugs/missing/reject").send();

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Local bug not found.");
    });
  });

  describe("POST /bugs/:id/restore", () => {
    it("should successfully restore a bug", async () => {
      const restoredBug = Bug.builder().setId("local-1").setStatus("pending").build();
      mockBugLifecycleUseCase.restoreBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(restoredBug),
      );

      const res = await request(app).post("/bugs/local-1/restore").send();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("pending");
      expect(mockBugLifecycleUseCase.restoreBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "restoreBug",
          data: { id: "local-1", adminId: "admin-123" },
        }),
      );
    });
  });

  describe("GET /bugs/repos", () => {
    it("should successfully query managed repos", async () => {
      mockBugQueryUseCase.queryBugRepos.mockResolvedValue(
        new ResponseModel<string[]>("tx-id").withResponse(["VariaMos/VariaMosAdmin"]),
      );

      const res = await request(app).get("/bugs/repos");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(["VariaMos/VariaMosAdmin"]);
      expect(mockBugQueryUseCase.queryBugRepos).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "queryBugRepos",
        }),
      );
    });

    it("should return 400 when queryBugRepos throws an exception", async () => {
      mockBugQueryUseCase.queryBugRepos.mockRejectedValue(new Error("Internal Config Fail"));

      const res = await request(app).get("/bugs/repos");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Internal Config Fail");
    });
  });

  describe("GET /bugs/categories", () => {
    it("should successfully query allowed categories", async () => {
      mockBugQueryUseCase.queryCategories.mockResolvedValue(
        new ResponseModel<string[]>("tx-id").withResponse(["Editor", "Model"]),
      );

      const res = await request(app).get("/bugs/categories");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(["Editor", "Model"]);
      expect(mockBugQueryUseCase.queryCategories).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "queryCategories",
        }),
      );
    });

    it("should return 400 when queryCategories throws an exception", async () => {
      mockBugQueryUseCase.queryCategories.mockRejectedValue(new Error("Database Query Failed"));

      const res = await request(app).get("/bugs/categories");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Database Query Failed");
    });
  });

  describe("POST /bugs", () => {
    it("should successfully create a new local bug without attachment", async () => {
      const newBug = Bug.builder().setId("local-new").setTitle("UI Crash").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );

      const res = await request(app).post("/bugs").send({
        title: "UI Crash",
        description: "Crashes on click",
        category: "Editor",
        priority: "medium",
        reporterEmail: "user@example.com",
        githubRepo: "VariaMos/VariaMosAdmin",
      });

      expect(res.status).toBe(201); // created success code mapped to HttpStatusCodes.CREATED
      expect(res.body.data.id).toBe("local-new");
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: "admin-123",
            reporterEmail: "user@example.com",
            githubRepo: "VariaMos/VariaMosAdmin",
          }),
        }),
      );
    });

    it("should trigger multer upload destination and filename logic when file is attached", async () => {
      const newBug = Bug.builder().setId("local-file").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );

      const res = await request(app)
        .post("/bugs")
        .attach("file", Buffer.from("dummy image content"), "screenshot.png")
        .field("title", "Bug with image")
        .field("description", "Desc")
        .field("category", "Editor");

      expect(res.status).toBe(201);
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            file: expect.objectContaining({
              mimetype: "image/png",
            }),
          }),
        }),
      );
    });

    it("should return 400 when creation throws an error", async () => {
      mockBugSubmissionUseCase.createBug.mockRejectedValue(new Error("Required fields missing"));

      const res = await request(app).post("/bugs").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Required fields missing");
    });
  });

  describe("GET /bugs/:id/history", () => {
    it("should successfully fetch bug status log history", async () => {
      mockBugQueryUseCase.queryHistory.mockResolvedValue(
        new ResponseModel<BugStatusLog[]>("tx-id").withResponse([]),
      );

      const res = await request(app).get("/bugs/local-1/history");

      expect(res.status).toBe(200);
      expect(mockBugQueryUseCase.queryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "queryHistory",
          data: "local-1",
        }),
      );
    });

    it("should return 400 when fetching history throws", async () => {
      mockBugQueryUseCase.queryHistory.mockRejectedValue(new Error("DB Query Timeout"));

      const res = await request(app).get("/bugs/local-1/history");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("DB Query Timeout");
    });
  });

  describe("POST /bugs/:id/status", () => {
    it("should successfully update bug status", async () => {
      const updatedBug = Bug.builder().setId("local-1").setStatus("closed").build();
      mockBugLifecycleUseCase.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(updatedBug),
      );

      const res = await request(app).post("/bugs/local-1/status").send({
        status: "closed",
        comment: "Issue resolved.",
        title: "New Title",
        description: "New Desc",
        category: "Editor",
        githubRepo: "VariaMos/VariaMosAdmin",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("closed");
      expect(mockBugLifecycleUseCase.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "updateStatus",
          data: {
            id: "local-1",
            status: "closed",
            comment: "Issue resolved.",
            adminId: "admin-123",
            adminEmail: "admin@example.com",
            title: "New Title",
            description: "New Desc",
            priority: undefined,
            category: "Editor",
            githubRepo: "VariaMos/VariaMosAdmin",
          },
        }),
      );
    });

    it("should return 400 when update status throws", async () => {
      mockBugLifecycleUseCase.updateStatus.mockRejectedValue(new Error("Update failed"));

      const res = await request(app).post("/bugs/local-1/status").send({ status: "closed" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Update failed");
    });
  });

  describe("POST /bugs/:id/reject exception routing", () => {
    it("should return 400 when rejectBug throws exception", async () => {
      mockBugLifecycleUseCase.rejectBug.mockRejectedValue(new Error("Reject exception"));

      const res = await request(app).post("/bugs/local-1/reject").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Reject exception");
    });
  });

  describe("POST /bugs/:id/restore exception routing", () => {
    it("should return 400 when restoreBug throws exception", async () => {
      mockBugLifecycleUseCase.restoreBug.mockRejectedValue(new Error("Restore exception"));

      const res = await request(app).post("/bugs/local-1/restore").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Restore exception");
    });
  });

  describe("GET /bugs error routing", () => {
    it("should return 400 when queryBugs throws an exception", async () => {
      mockBugQueryUseCase.queryBugs.mockRejectedValue(new Error("Query exception"));

      const res = await request(app).get("/bugs");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Query exception");
    });
  });

  describe("GET /bugs/local error routing", () => {
    it("should return 400 when queryLocalBugs throws an exception", async () => {
      mockBugQueryUseCase.queryLocalBugs.mockRejectedValue(new Error("Query local exception"));

      const res = await request(app).get("/bugs/local");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Query local exception");
    });
  });

  describe("Multer and Error Mapping integration", () => {
    it("should map default success case when no error code is present", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(200);
    });

    it("should map defined domain error string to correct status code", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          "Unauthorized",
        ),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(401);
    });

    it("should fall back to 500 when error code string is unknown", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withError(
          "UNKNOWN_ERR" as unknown as DomainErrorCodes,
          "Error",
        ),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(500);
    });

    it("should return the exact numeric code if it is an unknown number", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withError("418" as unknown as DomainErrorCodes, "Teapot"),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(418);
    });

    it("should map direct numeric error codes correctly", async () => {
      mockBugQueryUseCase.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withError(
          "404" as unknown as DomainErrorCodes,
          "Not found",
        ),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /bugs/sync integration and exceptions", () => {
    it("should complete synchronization successfully", async () => {
      mockBugSyncUseCase.syncBugs.mockResolvedValue(
        new ResponseModel<void>("tx-id").withResponse(undefined),
      );

      const res = await request(app).post("/bugs/sync").send();

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("synchronization completed successfully");
      expect(mockBugSyncUseCase.syncBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "syncBugs",
        }),
      );
    });

    it("should return error if token is missing", async () => {
      mockBugSyncUseCase.syncBugs.mockResolvedValue(
        new ResponseModel<void>("tx-id").withError(
          DomainErrorCodes.INVALID_INPUT,
          "GitHub Sync is not configured.",
        ),
      );

      const res = await request(app).post("/bugs/sync").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("GitHub Sync is not configured.");
    });

    it("should return 400 when syncBugs throws an exception", async () => {
      mockBugSyncUseCase.syncBugs.mockRejectedValue(new Error("Sync exception"));

      const res = await request(app).post("/bugs/sync").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Sync exception");
    });
  });

  describe("Guest access (missing user session)", () => {
    let guestApp: express.Application;

    beforeEach(() => {
      guestApp = express();
      guestApp.use(cookieParser());
      guestApp.use(express.json());
      const noAuth: RequestHandler = (req, res, next) => next();
      guestApp.use(
        "/bugs",
        createBugRouter(
          mockBugSubmissionUseCase,
          mockBugLifecycleUseCase,
          mockBugSyncUseCase,
          mockBugQueryUseCase,
          mockBugAttachmentUseCase,
          mockUpload,
          noAuth,
        ),
      );
      mockValidateSession.mockReset();
    });

    it("should handle request with undefined user session in POST /bugs", async () => {
      const newBug = Bug.builder().setId("local-guest").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );

      const res = await request(guestApp).post("/bugs").send({
        title: "Guest UI Crash",
        description: "Desc",
        category: "Editor",
      });

      expect(res.status).toBe(201);
      expect(mockValidateSession).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith("POST /bugs: Extracted token: none");
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });

    it("should extract and resolve user from cookie authToken", async () => {
      const newBug = Bug.builder().setId("local-cookie").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockResolvedValue({
        data: { id: "user-via-cookie" },
      });

      const res = await request(guestApp)
        .post("/bugs")
        .set("Cookie", ["authToken=my-cool-cookie-token"])
        .send({
          title: "Cookie UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("my-cool-cookie-token");
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "POST /bugs: Extracted token: my-cool-cookie-...",
      );
      expect(mockLoggerErr).not.toHaveBeenCalled();
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: "user-via-cookie",
          }),
        }),
      );
    });

    it("should extract and resolve user from Authorization header", async () => {
      const newBug = Bug.builder().setId("local-header").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockResolvedValue({
        data: { sub: "user-via-header" },
      });

      const res = await request(guestApp)
        .post("/bugs")
        .set("Authorization", "Bearer my-cool-header-token")
        .send({
          title: "Header UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("my-cool-header-token");
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "POST /bugs: Extracted token: my-cool-header-...",
      );
      expect(mockLoggerErr).not.toHaveBeenCalled();
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: "user-via-header",
          }),
        }),
      );
    });

    it("should gracefully handle validateSession exception", async () => {
      const newBug = Bug.builder().setId("local-error").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockRejectedValue(new Error("Session validation error"));

      const res = await request(guestApp)
        .post("/bugs")
        .set("Authorization", "Bearer bad-token")
        .send({
          title: "Error UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("bad-token");
      expect(mockLoggerErr).toHaveBeenCalled();
      // Fall back to guest (createdById is undefined)
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });

    it("should handle session validation returning null or empty data", async () => {
      const newBug = Bug.builder().setId("local-guest").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockResolvedValue(null);

      const res = await request(guestApp)
        .post("/bugs")
        .set("Authorization", "Bearer token-no-data")
        .send({
          title: "Guest UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("token-no-data");
      expect(mockLoggerErr).not.toHaveBeenCalled();
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });

    it("should handle session validation returning data without id or sub", async () => {
      const newBug = Bug.builder().setId("local-guest").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockResolvedValue({
        data: {},
      });

      const res = await request(guestApp)
        .post("/bugs")
        .set("Authorization", "Bearer token-empty-data")
        .send({
          title: "Guest UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("token-empty-data");
      expect(mockLoggerErr).not.toHaveBeenCalled();
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });

    it("should handle session validation returning empty string for id", async () => {
      const newBug = Bug.builder().setId("local-guest").build();
      mockBugSubmissionUseCase.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(newBug),
      );
      mockValidateSession.mockResolvedValue({
        data: { id: "", sub: "" },
      });

      const res = await request(guestApp)
        .post("/bugs")
        .set("Authorization", "Bearer token-empty-string-id")
        .send({
          title: "Guest UI Crash",
          description: "Desc",
          category: "Editor",
        });

      expect(res.status).toBe(201);
      expect(mockValidateSession).toHaveBeenCalledWith("token-empty-string-id");
      expect(mockLoggerErr).not.toHaveBeenCalled();
      expect(mockBugSubmissionUseCase.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "createBug",
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });
  });

  describe("Bug Attachments Integration Tests", () => {
    describe("POST /bugs/:id/attachments", () => {
      it("should successfully upload and add an attachment to a bug", async () => {
        mockBugAttachmentUseCase.addAttachment.mockResolvedValue(
          new ResponseModel<BugAttachment>("tx-id").withResponse(
            BugAttachment.builder()
              .setId(1)
              .setFilePath("/uploads/test-image.png")
              .setFileType("image/png")
              .setBugId("local-1")
              .build(),
          ),
        );

        const res = await request(app)
          .post("/bugs/local-1/attachments")
          .attach("file", Buffer.from("fake png"), "test-image.png");

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(1);
        expect(mockBugAttachmentUseCase.addAttachment).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: "addAttachment",
            data: expect.objectContaining({
              bugId: "local-1",
              file: expect.objectContaining({
                mimetype: "image/png",
              }),
            }),
          }),
        );
      });

      it("should handle unexpected errors during attachment upload and return 400", async () => {
        mockBugAttachmentUseCase.addAttachment.mockRejectedValue(new Error("Upload failed"));

        const res = await request(app)
          .post("/bugs/local-1/attachments")
          .attach("file", Buffer.from("fake png"), "test-image.png");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Upload failed");
      });

      it("should return 400 when no file is attached", async () => {
        const res = await request(app).post("/bugs/local-1/attachments").send();

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("File attachment is required.");
      });
    });

    describe("DELETE /bugs/attachments/:id", () => {
      it("should successfully delete an attachment", async () => {
        mockBugAttachmentUseCase.deleteAttachment.mockResolvedValue(
          new ResponseModel<void>("tx-id").withResponse(undefined),
        );

        const res = await request(app).delete("/bugs/attachments/1");

        expect(res.status).toBe(200);
        expect(mockBugAttachmentUseCase.deleteAttachment).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: "deleteAttachment",
            data: "1",
          }),
        );
      });

      it("should handle unexpected errors during attachment deletion and return 400", async () => {
        mockBugAttachmentUseCase.deleteAttachment.mockRejectedValue(new Error("Delete failed"));

        const res = await request(app).delete("/bugs/attachments/1");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Delete failed");
      });
    });
  });

  describe("Bug Notes Integration Tests", () => {
    describe("POST /bugs/:id/notes", () => {
      it("should successfully create a new note for a bug", async () => {
        mockBugAttachmentUseCase.createNote.mockResolvedValue(
          new ResponseModel<BugNote>("tx-id").withResponse(
            BugNote.builder()
              .setId(10)
              .setBugId("local-1")
              .setBody("Hello note")
              .setAuthorId("admin-123")
              .build(),
          ),
        );

        const res = await request(app).post("/bugs/local-1/notes").send({ body: "Hello note" });

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(10);
        expect(mockBugAttachmentUseCase.createNote).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: "createBugNote",
            data: {
              bugId: "local-1",
              body: "Hello note",
              authorId: "admin-123",
            },
          }),
        );
      });

      it("should handle unexpected errors during note creation and return 400", async () => {
        mockBugAttachmentUseCase.createNote.mockRejectedValue(new Error("Note creation failed"));

        const res = await request(app).post("/bugs/local-1/notes").send({ body: "Hello note" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Note creation failed");
      });
    });

    describe("GET /bugs/:id/notes", () => {
      it("should successfully fetch notes for a bug", async () => {
        mockBugQueryUseCase.queryNotes.mockResolvedValue(
          new ResponseModel<BugNote[]>("tx-id").withResponse([
            BugNote.builder().setId(10).setBody("Hello note").build(),
          ]),
        );

        const res = await request(app).get("/bugs/local-1/notes");

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(10);
        expect(mockBugQueryUseCase.queryNotes).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: "queryBugNotes",
            data: "local-1",
          }),
        );
      });

      it("should handle unexpected errors during notes query and return 400", async () => {
        mockBugQueryUseCase.queryNotes.mockRejectedValue(new Error("Notes query failed"));
        const res = await request(app).get("/bugs/local-1/notes");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Notes query failed");
      });
    });
  });
});
