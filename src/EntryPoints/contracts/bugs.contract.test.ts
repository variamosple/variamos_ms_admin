import { mock } from "vitest-mock-extended";

vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) =>
      next(),
}));

import express, { type RequestHandler } from "express";
import multer from "multer";
import request from "supertest";
import { z } from "zod";
import { Bug, type BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import { BugAttachment } from "#src/Domain/Bug/Entity/BugAttachment.js";
import { BugNote } from "#src/Domain/Bug/Entity/BugNote.js";
import type { BugAssignmentUseCase } from "#src/Domain/Bug/UseCase/BugAssignmentUseCase.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
import type { BugSubmissionUseCase } from "#src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { createBugRouter } from "../BugRouter.js";

/*
 * Response contract of the bug routes (EV-98, step 1): the answers keep the
 * shape VariaMosAdmin reads. The schemas copy those of
 * VariaMosAdmin/src/features/bug-tracker/api/bugSchemas.ts; they are loose,
 * as there: a field added by the server breaks nothing, a field renamed,
 * removed or of another type fails here before it fails on the screen.
 * When the screen reads a new field, add it here in the same pull request.
 */

// VariaMosAdmin/src/shared/api/parseResponse.ts
const envelope = <T extends z.ZodType>(data: T) =>
  z.looseObject({
    transactionId: z.optional(z.string()),
    errorCode: z.optional(z.nullable(z.union([z.number(), z.string()]))),
    message: z.optional(z.string()),
    totalCount: z.optional(z.number()),
    data,
  });
const noData = z.optional(z.nullable(z.undefined()));
// VariaMosAdmin/src/shared/api/schemas.ts
const textOrEmpty = z.nullable(z.string());

const userRefSchema = z.looseObject({ id: z.string(), name: textOrEmpty });
const userRefsSchema = z.array(userRefSchema);
const attachmentSchema = z.looseObject({
  id: z.number(),
  filePath: z.string(),
  fileType: z.string(),
  bugId: z.string(),
  createdAt: z.optional(z.string()),
});
const bugSchema = z.looseObject({
  id: z.optional(z.string()),
  title: z.string(),
  description: z.string(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  category: z.optional(z.string()),
  component: z.optional(z.string()),
  status: z.optional(z.string()),
  githubRepo: z.optional(z.string()),
  gitIssueNumber: z.optional(z.number()),
  githubCreator: z.optional(z.string()),
  createdAt: z.optional(z.string()),
  updatedAt: z.optional(z.string()),
  createdBy: z.optional(
    z.looseObject({
      id: z.string(),
      name: textOrEmpty,
      email: z.optional(z.string()),
    }),
  ),
  attachments: z.optional(z.array(attachmentSchema)),
  reporterEmail: z.optional(z.string()),
  assignedAdmins: z.optional(userRefsSchema),
});
const bugsSchema = z.array(bugSchema);
const textsSchema = z.array(z.string());
const notesSchema = z.array(
  z.looseObject({
    id: z.number(),
    body: z.string(),
    createdAt: z.string(),
    author: z.optional(z.looseObject({ name: z.string() })),
  }),
);

/** The body follows the schema; the issues name the fields that do not. */
const expectContract = (schema: z.ZodType, body: unknown) => {
  const parsed = schema.safeParse(body);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
};

const attachment = () =>
  BugAttachment.builder()
    .setId(7)
    .setFilePath("bugs/bug-1/screenshot.png")
    .setFileType("image/png")
    .setBugId("bug-1")
    .setCreatedAt(new Date("2026-11-02T10:00:00Z"))
    .build();

// A bug with every field the repositories fill
const fullBug = () =>
  Bug.builder()
    .setId("bug-1")
    .setTitle("The editor freezes")
    .setDescription("After the third model")
    .setPriority("high")
    .setCategory("Editor")
    .setComponent("admin")
    .setStatus("open")
    .setGithubRepo("variamosple/VariaMosAdmin")
    .setGitIssueNumber(42)
    .setGithubCreator("variamos-bot")
    .setGithubHtmlUrl("https://github.com/variamosple/VariaMosAdmin/issues/42")
    .setCreatedById("user-1")
    .setReporterEmail("reporter@example.com")
    .setCreatedAt(new Date("2026-11-01T09:00:00Z"))
    .setUpdatedAt(new Date("2026-11-02T09:00:00Z"))
    .setCreatedBy({ id: "user-1", name: "Reporter", email: "r@example.com" })
    .setAttachments([attachment()])
    .setAssignedAdmins([{ id: "admin-1", name: "Admin" }])
    .build();

// A local bug, never published, as a guest reports it
const localBug = () =>
  Bug.builder()
    .setId("bug-2")
    .setTitle("Typo")
    .setDescription("On the home page")
    .setPriority("low")
    .setStatus("pending")
    .setReporterEmail("guest@example.com")
    .setCreatedAt(new Date("2026-11-01T09:00:00Z"))
    .build();

const queries = mock<BugQueryUseCase>();
const assignments = mock<BugAssignmentUseCase>();
const attachments = mock<BugAttachmentUseCase>();
const sync = mock<BugSyncUseCase>();

const signedIn: RequestHandler = (req, _res, next) => {
  (req as { user?: { id: string; email?: string } }).user = {
    id: "admin-1",
    email: "admin@example.com",
  };
  next();
};
const app = express();
app.use(express.json());
app.use(signedIn);
app.use(
  "/bugs",
  createBugRouter(
    mock<BugSubmissionUseCase>(),
    mock<BugLifecycleUseCase>(),
    sync,
    queries,
    attachments,
    multer({ storage: multer.memoryStorage() }),
    signedIn,
    assignments,
  ),
);

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

describe("Bug routes keep the shape VariaMosAdmin reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["GET /bugs", "/bugs", "queryBugs"],
    ["GET /bugs/local", "/bugs/local", "queryLocalBugs"],
  ] as const)("%s", async (_, path, method) => {
    queries[method].mockResolvedValue(
      new ResponseModel<Bug[]>("tx", undefined, undefined, 2).withResponse([
        fullBug(),
        localBug(),
      ]),
    );

    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expectContract(envelope(bugsSchema), res.body);
  });

  it("GET /bugs/assignable-users", async () => {
    assignments.queryAssignableUsers.mockResolvedValue(
      new ResponseModel<BugUserRef[]>("tx").withResponse([
        { id: "admin-1", name: "Admin" },
      ]),
    );

    const res = await request(app).get("/bugs/assignable-users");

    expect(res.status).toBe(200);
    expectContract(envelope(userRefsSchema), res.body);
  });

  it("PUT /bugs/:id/assignees", async () => {
    assignments.setAssignees.mockResolvedValue(
      new ResponseModel<BugUserRef[]>("tx").withResponse([
        { id: "admin-1", name: "Admin" },
      ]),
    );

    const res = await request(app)
      .put("/bugs/bug-1/assignees")
      .send({ userIds: ["admin-1"] });

    expect(res.status).toBe(200);
    expectContract(envelope(userRefsSchema), res.body);
  });

  it.each([
    ["GET /bugs/repos", "/bugs/repos", "queryBugRepos"],
    ["GET /bugs/categories", "/bugs/categories", "queryCategories"],
  ] as const)("%s", async (_, path, method) => {
    queries[method].mockResolvedValue(
      new ResponseModel<string[]>("tx").withResponse(["one", "two"]),
    );

    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expectContract(envelope(textsSchema), res.body);
  });

  it("POST /bugs/sync answers without data", async () => {
    sync.syncBugs.mockResolvedValue(new ResponseModel<void>("tx"));

    const res = await request(app).post("/bugs/sync");

    expect(res.status).toBe(200);
    expectContract(envelope(noData), res.body);
  });

  it("POST /bugs/:id/attachments", async () => {
    attachments.addAttachment.mockResolvedValue(
      new ResponseModel<BugAttachment>("tx").withResponse(attachment()),
    );

    const res = await request(app)
      .post("/bugs/bug-1/attachments")
      .attach("file", PNG_BYTES, {
        filename: "screenshot.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expectContract(envelope(attachmentSchema), res.body);
  });

  it("GET /bugs/:id/notes", async () => {
    queries.queryNotes.mockResolvedValue(
      new ResponseModel<BugNote[]>("tx").withResponse([
        BugNote.builder()
          .setId(3)
          .setBody("Reproduced")
          .setBugId("bug-1")
          .setAuthorId("admin-1")
          .setCreatedAt(new Date("2026-11-02T11:00:00Z"))
          .setAuthor({ name: "Admin" })
          .build(),
      ]),
    );

    const res = await request(app).get("/bugs/bug-1/notes");

    expect(res.status).toBe(200);
    expectContract(envelope(notesSchema), res.body);
  });

  // The screens read the code and the message of a refusal
  it("an error keeps its code and message", async () => {
    queries.queryBugs.mockResolvedValue(
      new ResponseModel<Bug[]>("tx").withError(
        DomainErrorCodes.INVALID_INPUT,
        "The filter is not valid.",
      ),
    );

    const res = await request(app).get("/bugs");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: "The filter is not valid.",
    });
  });
});
