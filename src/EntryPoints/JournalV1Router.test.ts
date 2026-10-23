import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import type { IJournalReader } from "#src/Domain/Activity/JournalQuery.js";
import { JournalQueryUseCase } from "#src/Domain/Activity/JournalQueryUseCase.js";
import {
  ACCESS_LOGS_V1_ROUTE,
  ACTIVITY_LOGS_V1_ROUTE,
  createAccessLogsRouter,
  createActivityLogsRouter,
} from "./JournalV1Router.js";

const { checkedPermissions } = vi.hoisted(() => ({
  checkedPermissions: [] as string[][],
}));

// Records the permissions asked; refuses when the header says so
vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    (permissions: string[]) =>
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      checkedPermissions.push(permissions);
      if (req.headers["x-test-refuse"]) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }
      next();
    },
}));

const setUp = () => {
  const reader = mock<IJournalReader>();
  reader.queryActivity.mockResolvedValue({ rows: [], total: 0 });
  reader.queryAccess.mockResolvedValue({ rows: [], total: 0 });
  const useCase = new JournalQueryUseCase(reader);
  const app = express();
  app.use(ACTIVITY_LOGS_V1_ROUTE, createActivityLogsRouter(useCase));
  app.use(ACCESS_LOGS_V1_ROUTE, createAccessLogsRouter(useCase));
  return { app, reader };
};

describe("journal routes (T-24 lot 3)", () => {
  beforeEach(() => {
    checkedPermissions.length = 0;
  });

  it.each([ACTIVITY_LOGS_V1_ROUTE, ACCESS_LOGS_V1_ROUTE])(
    "%s asks for the journal permission",
    async (route) => {
      const { app, reader } = setUp();

      const response = await supertest(app)
        .get(route)
        .set("x-test-refuse", "1");

      expect(response.status).toBe(403);
      expect(checkedPermissions).toEqual([["activity-logs::query"]]);
      expect(reader.queryActivity).not.toHaveBeenCalled();
      expect(reader.queryAccess).not.toHaveBeenCalled();
    },
  );

  it("answers a page of the activity journal with its total", async () => {
    const { app, reader } = setUp();
    reader.queryActivity.mockResolvedValue({
      rows: [
        {
          id: "1",
          occurredAt: new Date("2026-10-23T10:00:00.000Z"),
          actorId: "user-1",
          actor: { id: "user-1", name: "Ana", email: "ana@example.com" },
          action: "role.update",
          entityType: "role",
          entityId: "7",
          outcome: "success",
          errorCode: null,
          before: { name: "Old" },
          after: { name: "New" },
          transactionId: "updateRole",
        },
      ],
      total: 51,
    });

    const response = await supertest(app)
      .get(ACTIVITY_LOGS_V1_ROUTE)
      .query({ action: "role.update", pageSize: "1" })
      .expect(200);

    expect(response.body).toMatchObject({
      transactionId: "queryActivityLogs",
      totalCount: 51,
      data: [
        {
          id: "1",
          occurredAt: "2026-10-23T10:00:00.000Z",
          actor: { name: "Ana" },
          before: { name: "Old" },
        },
      ],
    });
    expect(reader.queryActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.update", pageSize: 1 }),
    );
  });

  it("refuses an invalid filter with 400", async () => {
    const { app, reader } = setUp();

    const response = await supertest(app)
      .get(ACCESS_LOGS_V1_ROUTE)
      .query({ event: "sign-out" })
      .expect(400);

    expect(response.body.errorCode).toBe("INVALID_INPUT");
    expect(reader.queryAccess).not.toHaveBeenCalled();
  });

  it("answers 500 without the error message when the read fails", async () => {
    const { app, reader } = setUp();
    reader.queryAccess.mockRejectedValue(new Error("relation does not exist"));

    const response = await supertest(app).get(ACCESS_LOGS_V1_ROUTE).expect(500);

    expect(JSON.stringify(response.body)).not.toContain("relation");
  });
});
