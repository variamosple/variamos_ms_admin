import express, { type RequestHandler } from "express";
import request from "supertest";
import { mock } from "vitest-mock-extended";
import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { INotificationAccessTokenIssuer } from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";
import type { User } from "#src/Domain/User/Entity/User.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { INTERNAL_ERROR_MESSAGE } from "./errorResponse.js";
import {
  createNotificationAccessRouter,
  NOTIFICATION_ACCESS_V1_ROUTE,
} from "./NotificationAccessRouter.js";

describe("GET /v1/notifications/access-token", () => {
  const issuer = mock<INotificationAccessTokenIssuer>();
  const sessionUsers = mock<Pick<UserQueryUseCase, "sessionUser">>();
  const openAccount = () =>
    new ResponseModel<User>("t").withResponse({ id: "user-42" } as User);

  const appWithUser = (user?: { id?: string; roles?: string[] }) => {
    const app = express();
    const auth: RequestHandler = (req, _res, next) => {
      (req as { user?: unknown }).user = user;
      next();
    };
    app.use(
      NOTIFICATION_ACCESS_V1_ROUTE,
      createNotificationAccessRouter(issuer, auth, sessionUsers),
    );
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionUsers.sessionUser.mockResolvedValue(openAccount());
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
      createNotificationAccessRouter(issuer, refuse, sessionUsers),
    );

    await request(app).get("/v1/notifications/access-token").expect(401);
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  describe("account read again (ADM-N19)", () => {
    it("reads the account of the session before it issues a token", async () => {
      issuer.issue.mockResolvedValue({
        token: "signed.jwt.token",
        expiresAt: new Date("2026-10-16T12:15:00Z"),
      });

      await request(appWithUser({ id: "user-42" }))
        .get("/v1/notifications/access-token")
        .expect(200);

      expect(sessionUsers.sessionUser).toHaveBeenCalledWith(
        expect.objectContaining({ data: "user-42" }),
      );
    });

    it.each([
      ["disabled", DomainErrorCodes.INVALID_INPUT],
      ["missing", DomainErrorCodes.ENTITY_NOT_FOUND],
    ])("gives no token to a %s account", async (_state, errorCode) => {
      sessionUsers.sessionUser.mockResolvedValue(
        new ResponseModel<User>("t").withError(errorCode, "closed"),
      );

      const response = await request(appWithUser({ id: "user-42" }))
        .get("/v1/notifications/access-token")
        .expect(401);

      expect(response.body.errorCode).toBe("UNAUTHORIZED_ACCESS");
      expect(issuer.issue).not.toHaveBeenCalled();
    });

    it("answers 500 when the account cannot be read", async () => {
      vi.spyOn(logger, "err").mockImplementation(() => {});
      sessionUsers.sessionUser.mockResolvedValue(
        new ResponseModel<User>("t").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "database down",
        ),
      );

      const response = await request(appWithUser({ id: "user-42" }))
        .get("/v1/notifications/access-token")
        .expect(500);

      expect(JSON.stringify(response.body)).not.toContain("database down");
      expect(issuer.issue).not.toHaveBeenCalled();
    });

    it("issues a token to a guest, who has no account to read", async () => {
      issuer.issue.mockResolvedValue({
        token: "signed.jwt.token",
        expiresAt: new Date("2026-10-16T12:15:00Z"),
      });

      await request(appWithUser({ id: "guest-1", roles: ["Guest"] }))
        .get("/v1/notifications/access-token")
        .expect(200);

      expect(sessionUsers.sessionUser).not.toHaveBeenCalled();
      expect(issuer.issue).toHaveBeenCalledWith("guest-1");
    });
  });
});
