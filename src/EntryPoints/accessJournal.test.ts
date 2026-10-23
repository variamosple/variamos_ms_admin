import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { recordAccess, recordRefusals } from "./accessJournal.js";

const journal = mock<IAccessJournal>();

const appWith = (
  status: number,
  options: { user?: { id: string }; recorded?: boolean } = {},
) => {
  const app = express();
  app.use(recordRefusals(journal));
  app.use((req, res) => {
    if (options.user) req.user = options.user as never;
    if (options.recorded) {
      recordAccess(journal, req, res, {
        event: "sign-in",
        outcome: "failed",
        reason: "locked",
        userId: "user-9",
      });
    }
    res.sendStatus(status);
  });
  return app;
};

describe("access journal of the routes (T-24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "too_many_requests"],
  ])("records a %i refusal", async (status, reason) => {
    await supertest(appWith(status, { user: { id: "user-1" } })).get(
      "/v1/users?token=secret",
    );

    await vi.waitFor(() =>
      expect(journal.record).toHaveBeenCalledWith({
        event: "access.refused",
        outcome: "failed",
        reason,
        userId: "user-1",
        ip: expect.any(String),
        method: "GET",
        // Never the query string, which may carry a token
        path: "/v1/users",
        statusCode: status,
      }),
    );
  });

  it.each([200, 302, 400, 404, 500])(
    "records nothing for a %i answer",
    async (status) => {
      await supertest(appWith(status)).get("/v1/users");

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(journal.record).not.toHaveBeenCalled();
    },
  );

  it.each(["/auth/session-info", "/auth/guest/sign-in"])(
    "records no refusal of %s",
    async (path) => {
      await supertest(appWith(401)).get(path);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(journal.record).not.toHaveBeenCalled();
    },
  );

  it("records as failed a success whose answer then failed", async () => {
    const app = express();
    app.use((req, res) => {
      recordAccess(journal, req, res, {
        event: "sign-in",
        outcome: "success",
        reason: null,
        userId: "user-1",
      });
      res.sendStatus(500);
    });

    await supertest(app).post("/auth/sign-in");

    await vi.waitFor(() =>
      expect(journal.record).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "failed", statusCode: 500 }),
      ),
    );
  });

  it("records a sign-in once, as a sign-in and not as a refusal", async () => {
    await supertest(appWith(429, { recorded: true })).post("/auth/sign-in");

    await vi.waitFor(() =>
      expect(journal.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "sign-in",
          reason: "locked",
          userId: "user-9",
          path: "/auth/sign-in",
          statusCode: 429,
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(journal.record).toHaveBeenCalledTimes(1);
  });
});
