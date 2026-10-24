import express, { type RequestHandler } from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import type { BugAssignmentUseCase } from "#src/Domain/Bug/UseCase/BugAssignmentUseCase.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
import type { BugSubmissionUseCase } from "#src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";

// hasPermissions checks the permissions of req.user, as the real one does
vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    (required: string[]): RequestHandler =>
    (req, res, next) => {
      const held =
        (req.user as { permissions?: string[] } | undefined)?.permissions ?? [];
      if (required.every((p) => held.includes(p))) return next();
      res.status(403).json({ errorCode: 403 });
    },
}));

const { createBugRouter } = await import("./BugRouter.js");

function createApp(permissions: string[]) {
  const query = mock<BugQueryUseCase>();
  const lifecycle = mock<BugLifecycleUseCase>();
  const sync = mock<BugSyncUseCase>();
  const attachment = mock<BugAttachmentUseCase>();
  const assignment = mock<BugAssignmentUseCase>();
  const ok = new ResponseModel<never>("tx");
  for (const fn of [
    lifecycle.updateStatus,
    lifecycle.rejectBug,
    lifecycle.restoreBug,
    sync.syncBugs,
    attachment.addAttachment,
    attachment.deleteAttachment,
    attachment.createNote,
    assignment.setAssignees,
    assignment.queryAssignableUsers,
  ]) {
    fn?.mockResolvedValue?.(ok);
  }
  const reported = Bug.builder()
    .setId("b1")
    .setTitle("Crash")
    .setStatus("open")
    .setReporterEmail("reporter@example.com")
    .setCreatedBy({ id: "u1", name: "Ana", email: "ana@example.com" })
    .build();
  query.queryBugs.mockResolvedValue(
    new ResponseModel<Bug[]>("queryBugs").withResponse([reported]),
  );
  query.queryLocalBugs.mockResolvedValue(
    new ResponseModel<Bug[]>("queryLocalBugs").withResponse([reported]),
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "op-1", permissions } as never;
    next();
  });
  const passThrough: RequestHandler = (_req, _res, next) => next();
  app.use(
    "/bugs",
    createBugRouter(
      mock<BugSubmissionUseCase>(),
      lifecycle,
      sync,
      query,
      attachment,
      { single: () => passThrough } as never,
      passThrough,
      assignment,
    ),
  );
  return app;
}

const READ = ["bugs::query"];

describe("bug report permissions", () => {
  it("requires bugs::query to list reports", async () => {
    expect((await supertest(createApp([])).get("/bugs")).status).toBe(403);
    expect((await supertest(createApp(READ)).get("/bugs")).status).toBe(200);
  });

  it.each([
    ["post", "/bugs/b1/status"],
    ["post", "/bugs/b1/reject"],
    ["post", "/bugs/b1/restore"],
    ["post", "/bugs/b1/notes"],
    ["post", "/bugs/b1/attachments"],
    ["delete", "/bugs/attachments/a1"],
    ["put", "/bugs/b1/assignees"],
    ["get", "/bugs/assignable-users"],
  ] as const)(
    "%s %s needs bugs::update, not only bugs::query",
    async (method, path) => {
      const readOnly = await supertest(createApp(READ))[method](path).send({});
      const writer = await supertest(createApp([...READ, "bugs::update"]))
        [method](path)
        .send({});

      expect(readOnly.status).toBe(403);
      expect(writer.status).not.toBe(403);
    },
  );

  it("synchronization needs bugs::sync, not bugs::update", async () => {
    const app = (p: string[]) => supertest(createApp(p)).post("/bugs/sync");

    expect((await app([...READ, "bugs::update"])).status).toBe(403);
    expect((await app([...READ, "bugs::sync"])).status).not.toBe(403);
  });

  it.each(["/bugs", "/bugs/local"])(
    "%s hides reporter e-mails without bugs::update",
    async (path) => {
      const res = await supertest(createApp(READ)).get(path);

      expect(res.body.data[0].reporterEmail).toBeUndefined();
      expect(res.body.data[0].createdBy).toEqual({ id: "u1", name: "Ana" });
      expect(res.body.data[0].title).toBe("Crash");
    },
  );

  it.each(["/bugs", "/bugs/local"])(
    "%s shows reporter e-mails to moderators",
    async (path) => {
      const res = await supertest(createApp([...READ, "bugs::update"])).get(
        path,
      );

      expect(res.body.data[0].reporterEmail).toBe("reporter@example.com");
      expect(res.body.data[0].createdBy.email).toBe("ana@example.com");
    },
  );
});
