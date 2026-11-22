import express from "express";
import supertest from "supertest";
import type { BackgroundTaskStatus } from "#src/Domain/Scheduling/Entity/BackgroundTaskStatus.js";
import {
  BACKGROUND_TASKS_V1_ROUTE,
  createBackgroundTasksRouter,
} from "./BackgroundTasksV1Router.js";

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

const appOf = (list: () => BackgroundTaskStatus[]) => {
  const app = express();
  app.use(BACKGROUND_TASKS_V1_ROUTE, createBackgroundTasksRouter({ list }));
  return app;
};

describe("background tasks router (ADM-N34)", () => {
  it("returns each task with the dates of its runs", async () => {
    const sync: BackgroundTaskStatus = {
      name: "Periodic bugs synchronization",
      intervalMs: 900_000,
      running: false,
      lastRunAt: new Date("2026-11-22T09:00:00Z"),
      lastSuccessAt: null,
      lastFailureAt: new Date("2026-11-22T09:00:02Z"),
      consecutiveFailures: 4,
    };

    const res = await supertest(appOf(() => [sync])).get(
      "/v1/background-tasks",
    );

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.data).toEqual([
      {
        name: "Periodic bugs synchronization",
        intervalMs: 900_000,
        running: false,
        lastRunAt: "2026-11-22T09:00:00.000Z",
        lastSuccessAt: null,
        lastFailureAt: "2026-11-22T09:00:02.000Z",
        consecutiveFailures: 4,
      },
    ]);
  });

  it("answers 500 when the list cannot be read", async () => {
    const res = await supertest(
      appOf(() => {
        throw new Error("boom");
      }),
    ).get("/v1/background-tasks");

    expect(res.status).toBe(500);
  });
});
