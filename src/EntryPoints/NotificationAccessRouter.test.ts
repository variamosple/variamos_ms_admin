import express, { type RequestHandler } from "express";
import logger from "jet-logger";
import request from "supertest";
import { mock } from "vitest-mock-extended";
import type { INotificationAccessTokenIssuer } from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";
import { INTERNAL_ERROR_MESSAGE } from "./errorResponse.js";
import {
  createNotificationAccessRouter,
  NOTIFICATION_ACCESS_V1_ROUTE,
} from "./NotificationAccessRouter.js";

describe("GET /v1/notifications/access-token", () => {
  const issuer = mock<INotificationAccessTokenIssuer>();

  const appWithUser = (user?: { id?: string }) => {
    const app = express();
    const auth: RequestHandler = (req, _res, next) => {
      (req as { user?: unknown }).user = user;
      next();
    };
    app.use(
      NOTIFICATION_ACCESS_V1_ROUTE,
      createNotificationAccessRouter(issuer, auth),
    );
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues a token for the signed-in user and forbids caching it", async () => {
    const expiresAt = new Date("2026-10-16T12:15:00Z");
    issuer.issue.mockResolvedValue({ token: "signed.jwt.token", expiresAt });

    const response = await request(appWithUser({ id: "user-42" }))
      .get("/v1/notifications/access-token")
      .expect(200);

    expect(issuer.issue).toHaveBeenCalledWith("user-42");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toEqual({
      token: "signed.jwt.token",
      expiresAt: expiresAt.toISOString(),
    });
  });

  it("answers 401 when the session has no user", async () => {
    const response = await request(appWithUser(undefined))
      .get("/v1/notifications/access-token")
      .expect(401);

    expect(response.body.errorCode).toBe("UNAUTHORIZED_ACCESS");
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  it("answers 500 without details when the token cannot be issued", async () => {
    vi.spyOn(logger, "err").mockImplementation(() => {});
    issuer.issue.mockRejectedValue(new Error("key missing"));

    const response = await request(appWithUser({ id: "user-42" }))
      .get("/v1/notifications/access-token")
      .expect(500);

    expect(response.body.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(response.body)).not.toContain("key missing");
  });

  it("is protected by the session middleware", async () => {
    const app = express();
    const refuse: RequestHandler = (_req, res) => {
      res.status(401).end();
    };
    app.use(
      NOTIFICATION_ACCESS_V1_ROUTE,
      createNotificationAccessRouter(issuer, refuse),
    );

    await request(app).get("/v1/notifications/access-token").expect(401);
    expect(issuer.issue).not.toHaveBeenCalled();
  });
});
