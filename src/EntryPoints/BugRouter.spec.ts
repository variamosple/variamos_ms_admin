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
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { createBugRouter } from "./BugRouter";
import { BugUseCases } from "@src/Domain/Bug/BugUseCases";
import multer from "multer";

// Define the mock functions at the top scope of the file so they are hoisted cleanly
const mockQueryBugs = jest.fn();
const mockQueryLocalBugs = jest.fn();
const mockQueryBugRepos = jest.fn();
const mockQueryCategories = jest.fn();
const mockCreateBug = jest.fn();
const mockQueryHistory = jest.fn();
const mockUpdateStatus = jest.fn();
const mockRestoreBug = jest.fn();
const mockRejectBug = jest.fn();
const mockSyncBugs = jest.fn();
const mockAddAttachment = jest.fn();
const mockDeleteAttachment = jest.fn();
const mockCreateNote = jest.fn();
const mockQueryNotes = jest.fn();

// Mock the BugUseCases instances that the BugRouter imports, enforcing type safety on interface boundaries
const mockBugUseCases = {
  queryBugs: mockQueryBugs,
  queryLocalBugs: mockQueryLocalBugs,
  queryBugRepos: mockQueryBugRepos,
  queryCategories: mockQueryCategories,
  createBug: mockCreateBug,
  queryHistory: mockQueryHistory,
  updateStatus: mockUpdateStatus,
  restoreBug: mockRestoreBug,
  rejectBug: mockRejectBug,
  syncBugs: mockSyncBugs,
  addAttachment: mockAddAttachment,
  deleteAttachment: mockDeleteAttachment,
  createNote: mockCreateNote,
  queryNotes: mockQueryNotes,
} as unknown as BugUseCases;

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
app.use("/bugs", createBugRouter(mockBugUseCases, mockUpload, mockAuth));

describe("BugRouter HTTP Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return 200 and bug list on success", async () => {
      const mockBugs = [
        Bug.builder().setId("gh-1").setTitle("GitHub Issue 1").setStatus("open").build(),
      ];
      mockQueryBugs.mockResolvedValue(new ResponseModel("tx-id").withResponse(mockBugs));

      const res = await request(app)
        .get("/bugs")
        .query({ repo: "VariaMos/VariaMosAdmin", status: "open" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe("gh-1");
      expect(mockQueryBugs).toHaveBeenCalled();
    });

    it("should map domain error codes to correct HTTP error codes", async () => {
      mockQueryBugs.mockResolvedValue(
        new ResponseModel("tx-id").withError(
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
      mockQueryLocalBugs.mockResolvedValue(new ResponseModel("tx-id").withResponse(localBugs));

      const res = await request(app).get("/bugs/local").query({ status: "pending" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe("local-1");
      expect(mockQueryLocalBugs).toHaveBeenCalled();
    });
  });

  describe("POST /bugs/:id/reject", () => {
    it("should successfully reject a local bug", async () => {
      const rejectedBug = Bug.builder().setId("local-1").setStatus("rejected").build();
      mockRejectBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(rejectedBug));

      const res = await request(app).post("/bugs/local-1/reject").send();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("rejected");
      expect(mockRejectBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: "local-1", adminId: "admin-123" },
        }),
      );
    });

    it("should return 404 if bug is not found", async () => {
      mockRejectBug.mockResolvedValue(
        new ResponseModel("tx-id").withError(
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
      mockRestoreBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(restoredBug));

      const res = await request(app).post("/bugs/local-1/restore").send();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("pending");
      expect(mockRestoreBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: "local-1", adminId: "admin-123" },
        }),
      );
    });
  });

  describe("GET /bugs/repos", () => {
    it("should successfully query managed repos", async () => {
      mockQueryBugRepos.mockResolvedValue(
        new ResponseModel("tx-id").withResponse(["VariaMos/VariaMosAdmin"]),
      );

      const res = await request(app).get("/bugs/repos");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(["VariaMos/VariaMosAdmin"]);
      expect(mockQueryBugRepos).toHaveBeenCalled();
    });

    it("should return 400 when queryBugRepos throws an exception", async () => {
      mockQueryBugRepos.mockRejectedValue(new Error("Internal Config Fail"));

      const res = await request(app).get("/bugs/repos");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Internal Config Fail");
    });
  });

  describe("GET /bugs/categories", () => {
    it("should successfully query allowed categories", async () => {
      mockQueryCategories.mockResolvedValue(
        new ResponseModel("tx-id").withResponse(["Editor", "Model"]),
      );

      const res = await request(app).get("/bugs/categories");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(["Editor", "Model"]);
      expect(mockQueryCategories).toHaveBeenCalled();
    });

    it("should return 400 when queryCategories throws an exception", async () => {
      mockQueryCategories.mockRejectedValue(new Error("Database Query Failed"));

      const res = await request(app).get("/bugs/categories");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Database Query Failed");
    });
  });

  describe("POST /bugs", () => {
    it("should successfully create a new local bug without attachment", async () => {
      const newBug = Bug.builder().setId("local-new").setTitle("UI Crash").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));

      const res = await request(app).post("/bugs").send({
        title: "UI Crash",
        description: "Crashes on click",
        category: "Editor",
        priority: "medium",
        reporterEmail: "user@example.com",
      });

      expect(res.status).toBe(201); // created success code mapped to HttpStatusCodes.CREATED
      expect(res.body.data.id).toBe("local-new");
      expect(mockCreateBug).toHaveBeenCalled();
    });

    it("should return 400 when creation throws an error", async () => {
      mockCreateBug.mockRejectedValue(new Error("Required fields missing"));

      const res = await request(app).post("/bugs").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Required fields missing");
    });
  });

  describe("GET /bugs/:id/history", () => {
    it("should successfully fetch bug status log history", async () => {
      mockQueryHistory.mockResolvedValue(new ResponseModel("tx-id").withResponse([]));

      const res = await request(app).get("/bugs/local-1/history");

      expect(res.status).toBe(200);
      expect(mockQueryHistory).toHaveBeenCalledWith(expect.objectContaining({ data: "local-1" }));
    });

    it("should return 400 when fetching history throws", async () => {
      mockQueryHistory.mockRejectedValue(new Error("DB Query Timeout"));

      const res = await request(app).get("/bugs/local-1/history");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("DB Query Timeout");
    });
  });

  describe("POST /bugs/:id/status", () => {
    it("should successfully update bug status", async () => {
      const updatedBug = Bug.builder().setId("local-1").setStatus("closed").build();
      mockUpdateStatus.mockResolvedValue(new ResponseModel("tx-id").withResponse(updatedBug));

      const res = await request(app)
        .post("/bugs/local-1/status")
        .send({ status: "closed", comment: "Issue resolved." });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("closed");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: "local-1",
            status: "closed",
            comment: "Issue resolved.",
            adminId: "admin-123",
            adminEmail: "admin@example.com",
          },
        }),
      );
    });

    it("should return 400 when update status throws", async () => {
      mockUpdateStatus.mockRejectedValue(new Error("Update failed"));

      const res = await request(app).post("/bugs/local-1/status").send({ status: "closed" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Update failed");
    });
  });

  describe("POST /bugs/:id/reject exception routing", () => {
    it("should return 400 when rejectBug throws exception", async () => {
      mockRejectBug.mockRejectedValue(new Error("Reject exception"));

      const res = await request(app).post("/bugs/local-1/reject").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Reject exception");
    });
  });

  describe("POST /bugs/:id/restore exception routing", () => {
    it("should return 400 when restoreBug throws exception", async () => {
      mockRestoreBug.mockRejectedValue(new Error("Restore exception"));

      const res = await request(app).post("/bugs/local-1/restore").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Restore exception");
    });
  });

  describe("GET /bugs error routing", () => {
    it("should return 400 when queryBugs throws an exception", async () => {
      mockQueryBugs.mockRejectedValue(new Error("Query exception"));

      const res = await request(app).get("/bugs");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Query exception");
    });
  });

  describe("GET /bugs/local error routing", () => {
    it("should return 400 when queryLocalBugs throws an exception", async () => {
      mockQueryLocalBugs.mockRejectedValue(new Error("Query local exception"));

      const res = await request(app).get("/bugs/local");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Query local exception");
    });
  });

  describe("Multer and Error Mapping integration", () => {
    it("should map default success case when no error code is present", async () => {
      mockQueryBugs.mockResolvedValue(new ResponseModel("tx-id").withResponse([]));
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(200);
    });

    it("should map defined domain error string to correct status code", async () => {
      mockQueryBugs.mockResolvedValue(
        new ResponseModel("tx-id").withError(DomainErrorCodes.UNAUTHORIZED_ACCESS, "Unauthorized"),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(401);
    });

    it("should fall back to 500 when error code string is unknown", async () => {
      mockQueryBugs.mockResolvedValue(
        new ResponseModel("tx-id").withError("UNKNOWN_ERR" as unknown as DomainErrorCodes, "Error"),
      );
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(500);
    });

    it("should return the exact numeric code if it is an unknown number", async () => {
      mockQueryBugs.mockResolvedValue(new ResponseModel("tx-id").withError("418", "Teapot"));
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(418);
    });

    it("should map direct numeric error codes correctly", async () => {
      mockQueryBugs.mockResolvedValue(new ResponseModel("tx-id").withError("404", "Not found"));
      const res = await request(app).get("/bugs");
      expect(res.status).toBe(404);
    });

    it("should trigger multer upload destination and filename logic when file is attached", async () => {
      const newBug = Bug.builder().setId("local-file").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));

      const res = await request(app)
        .post("/bugs")
        .attach("file", Buffer.from("dummy image content"), "screenshot.png")
        .field("title", "Bug with image")
        .field("description", "Desc")
        .field("category", "Editor");

      expect(res.status).toBe(201);
      expect(mockCreateBug).toHaveBeenCalled();
    });
  });

  describe("POST /bugs/sync integration and exceptions", () => {
    it("should complete synchronization successfully", async () => {
      mockSyncBugs.mockResolvedValue(new ResponseModel("tx-id").withResponse(undefined));

      const res = await request(app).post("/bugs/sync").send();

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("synchronization completed successfully");
    });

    it("should return error if token is missing", async () => {
      mockSyncBugs.mockResolvedValue(
        new ResponseModel("tx-id").withError(
          DomainErrorCodes.INVALID_INPUT,
          "GitHub Sync is not configured.",
        ),
      );

      const res = await request(app).post("/bugs/sync").send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("GitHub Sync is not configured.");
    });

    it("should return 400 when syncBugs throws an exception", async () => {
      mockSyncBugs.mockRejectedValue(new Error("Sync exception"));

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
      guestApp.use("/bugs", createBugRouter(mockBugUseCases, mockUpload, noAuth));
      mockValidateSession.mockReset();
    });

    it("should handle request with undefined user session in POST /bugs", async () => {
      const newBug = Bug.builder().setId("local-guest").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));

      const res = await request(guestApp).post("/bugs").send({
        title: "Guest UI Crash",
        description: "Desc",
        category: "Editor",
      });

      expect(res.status).toBe(201);
      expect(mockCreateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: undefined,
          }),
        }),
      );
    });

    it("should extract and resolve user from cookie authToken", async () => {
      const newBug = Bug.builder().setId("local-cookie").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));
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
      expect(mockCreateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: "user-via-cookie",
          }),
        }),
      );
    });

    it("should extract and resolve user from Authorization header", async () => {
      const newBug = Bug.builder().setId("local-header").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));
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
      expect(mockCreateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: "user-via-header",
          }),
        }),
      );
    });

    it("should gracefully handle validateSession exception", async () => {
      const newBug = Bug.builder().setId("local-error").build();
      mockCreateBug.mockResolvedValue(new ResponseModel("tx-id").withResponse(newBug));
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
      // Fall back to guest (createdById is undefined)
      expect(mockCreateBug).toHaveBeenCalledWith(
        expect.objectContaining({
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
        const mockAttachment = {
          id: 1,
          filePath: "/uploads/test-image.png",
          fileType: "image/png",
          bugId: "local-1",
        };
        mockAddAttachment.mockResolvedValue(
          new ResponseModel("tx-id").withResponse(mockAttachment),
        );

        const res = await request(app)
          .post("/bugs/local-1/attachments")
          .attach("file", Buffer.from("fake png"), "test-image.png");

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(1);
        expect(mockAddAttachment).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              bugId: "local-1",
              file: expect.any(Object),
            }),
          }),
        );
      });

      it("should handle unexpected errors during attachment upload and return 400", async () => {
        mockAddAttachment.mockRejectedValue(new Error("Upload failed"));

        const res = await request(app)
          .post("/bugs/local-1/attachments")
          .attach("file", Buffer.from("fake png"), "test-image.png");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Upload failed");
      });
    });

    describe("DELETE /bugs/attachments/:id", () => {
      it("should successfully delete an attachment", async () => {
        mockDeleteAttachment.mockResolvedValue(new ResponseModel("tx-id").withResponse(undefined));

        const res = await request(app).delete("/bugs/attachments/1");

        expect(res.status).toBe(200);
        expect(mockDeleteAttachment).toHaveBeenCalledWith(
          expect.objectContaining({
            data: "1",
          }),
        );
      });

      it("should handle unexpected errors during attachment deletion and return 400", async () => {
        mockDeleteAttachment.mockRejectedValue(new Error("Delete failed"));

        const res = await request(app).delete("/bugs/attachments/1");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Delete failed");
      });
    });
  });

  describe("Bug Notes Integration Tests", () => {
    describe("POST /bugs/:id/notes", () => {
      it("should successfully create a new note for a bug", async () => {
        const mockNote = {
          id: 10,
          bugId: "local-1",
          body: "Hello note",
          authorId: "admin-123",
        };
        mockCreateNote.mockResolvedValue(new ResponseModel("tx-id").withResponse(mockNote));

        const res = await request(app).post("/bugs/local-1/notes").send({ body: "Hello note" });

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(10);
        expect(mockCreateNote).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              bugId: "local-1",
              body: "Hello note",
              authorId: "admin-123",
            },
          }),
        );
      });

      it("should handle unexpected errors during note creation and return 400", async () => {
        mockCreateNote.mockRejectedValue(new Error("Note creation failed"));

        const res = await request(app).post("/bugs/local-1/notes").send({ body: "Hello note" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Note creation failed");
      });
    });

    describe("GET /bugs/:id/notes", () => {
      it("should successfully fetch notes for a bug", async () => {
        mockQueryNotes.mockResolvedValue(
          new ResponseModel("tx-id").withResponse([{ id: 10, body: "Hello note" }]),
        );

        const res = await request(app).get("/bugs/local-1/notes");

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(10);
        expect(mockQueryNotes).toHaveBeenCalledWith(
          expect.objectContaining({
            data: "local-1",
          }),
        );
      });

      it("should handle unexpected errors during notes query and return 400", async () => {
        mockQueryNotes.mockRejectedValue(new Error("Notes query failed"));

        const res = await request(app).get("/bugs/local-1/notes");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Notes query failed");
      });
    });
  });
});
