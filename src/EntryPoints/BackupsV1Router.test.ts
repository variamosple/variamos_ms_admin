import express from "express";
import supertest from "supertest";
import { BACKUPS_V1_ROUTE, createBackupsRouter } from "./BackupsV1Router.js";

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

const appOf = (backups: Parameters<typeof createBackupsRouter>[0]) => {
  const app = express();
  app.use(BACKUPS_V1_ROUTE, createBackupsRouter(backups));
  return app;
};

describe("backups router (EV-86)", () => {
  it("says when the service has no backup status", async () => {
    const res = await supertest(appOf(null)).get("/v1/backups/status");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      configured: false,
      status: null,
      problems: [],
    });
  });

  it("returns the status and its problems", async () => {
    const report = {
      status: null,
      problems: [{ kind: "status-missing" as const, message: "unreadable" }],
    };
    const res = await supertest(
      appOf({ report: vi.fn(async () => report) }),
    ).get("/v1/backups/status");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ configured: true, ...report });
  });

  it("answers 500 when the status cannot be computed", async () => {
    const res = await supertest(
      appOf({ report: vi.fn(async () => Promise.reject(new Error("boom"))) }),
    ).get("/v1/backups/status");

    expect(res.status).toBe(500);
  });
});
