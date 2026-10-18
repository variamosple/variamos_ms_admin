import express, { type RequestHandler } from "express";
import logger from "jet-logger";
import request from "supertest";
import { mock } from "vitest-mock-extended";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { UserMfaUseCase } from "#src/Domain/Mfa/UseCase/UserMfaUseCase.js";
import { createMfaRouter, MFA_ROUTE } from "./MfaRouter.js";
import { RATE_LIMITS } from "./RateLimits.js";

const useCase = mock<UserMfaUseCase>();

const ANA = {
  id: "user-1",
  name: "Ana",
  user: "ana",
  email: "ana@example.com",
  roles: ["Viewer"],
};

/** The session check as hasPermissions does it, with the permissions seen. */
function appWith(user?: object) {
  const required: string[][] = [];
  const guard = (permissions: string[]): RequestHandler => {
    required.push(permissions);
    return (req, _res, next) => {
      (req as { user?: unknown }).user = user;
      next();
    };
  };
  const app = express();
  app.use(express.json());
  app.use(MFA_ROUTE, createMfaRouter(useCase, guard));
  return { app, required };
}

const ok = <T>(data: T) =>
  new ResponseModel<T>("t").withResponse(data as never);
const failed = (code: DomainErrorCodes, message = "no") =>
  new ResponseModel<never>("t").withError(code, message);

describe("MfaRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks my-account::query to read and my-account::update to change", () => {
    const { required } = appWith(ANA);

    expect(required).toEqual([
      ["my-account::query"],
      ["my-account::update"],
      ["my-account::update"],
      ["my-account::update"],
    ]);
  });

  it("gives the status, never cached", async () => {
    useCase.status.mockResolvedValue(
      ok({ available: true, enabled: false, recoveryCodesRemaining: 0 }),
    );

    const response = await request(appWith(ANA).app).get(MFA_ROUTE).expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toEqual({
      available: true,
      enabled: false,
      recoveryCodesRemaining: 0,
    });
    expect(useCase.status).toHaveBeenCalledWith("getMfaStatus", "user-1");
  });

  it.each([
    ["a guest", { ...ANA, id: "guest-uuid", roles: ["Guest"] }],
    ["no session", undefined],
  ])("refuses %s", async (_label, user) => {
    const response = await request(appWith(user).app)
      .post(`${MFA_ROUTE}/enrollment`)
      .send({ password: "x" })
      .expect(403);

    expect(response.body.errorCode).toBe("FORBIDDEN");
    expect(useCase.startEnrollment).not.toHaveBeenCalled();
  });

  it("starts the enrollment for the session user", async () => {
    useCase.startEnrollment.mockResolvedValue(
      ok({ otpauthUri: "otpauth://totp/x", secret: "ABC" }),
    );

    const response = await request(appWith(ANA).app)
      .post(`${MFA_ROUTE}/enrollment`)
      .send({ password: "Right-pass-1", userId: "someone-else" })
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(useCase.startEnrollment).toHaveBeenCalledWith(
      "startMfaEnrollment",
      "user-1",
      "ana@example.com",
      "Right-pass-1",
    );
  });

  it.each([
    [`${MFA_ROUTE}/enrollment`, {}],
    [`${MFA_ROUTE}/enrollment`, { password: 42 }],
    [`${MFA_ROUTE}/enrollment`, { password: "x".repeat(129) }],
    [`${MFA_ROUTE}/enrollment/confirm`, { code: "" }],
    [`${MFA_ROUTE}/disable`, { password: "x" }],
    [`${MFA_ROUTE}/disable`, { code: "123456" }],
  ])("refuses %s with %j", async (path, body) => {
    await request(appWith(ANA).app).post(path).send(body).expect(400);

    expect(useCase.startEnrollment).not.toHaveBeenCalled();
    expect(useCase.confirmEnrollment).not.toHaveBeenCalled();
    expect(useCase.disable).not.toHaveBeenCalled();
  });

  it("confirms and turns off with the session user", async () => {
    useCase.confirmEnrollment.mockResolvedValue(
      ok({ recoveryCodes: ["aaaaa-bbbbb"] }),
    );
    useCase.disable.mockResolvedValue(ok(null));
    const { app } = appWith(ANA);

    await request(app)
      .post(`${MFA_ROUTE}/enrollment/confirm`)
      .send({ code: "123456" })
      .expect(200);
    await request(app)
      .post(`${MFA_ROUTE}/disable`)
      .send({ password: "Right-pass-1", code: "654321" })
      .expect(200);

    expect(useCase.confirmEnrollment).toHaveBeenCalledWith(
      "confirmMfaEnrollment",
      "user-1",
      "123456",
    );
    expect(useCase.disable).toHaveBeenCalledWith(
      "disableMfa",
      "user-1",
      "Right-pass-1",
      "654321",
    );
  });

  it.each([
    [DomainErrorCodes.UNAVAILABLE, 503],
    [DomainErrorCodes.DUPLICATE_ENTITY, 409],
    [DomainErrorCodes.INVALID_INPUT, 400],
  ])("answers %s with %i", async (code, status) => {
    useCase.startEnrollment.mockResolvedValue(failed(code));

    await request(appWith(ANA).app)
      .post(`${MFA_ROUTE}/enrollment`)
      .send({ password: "x" })
      .expect(status);
  });

  it("refuses an account after five failures, on every route", async () => {
    useCase.confirmEnrollment.mockResolvedValue(
      failed(DomainErrorCodes.INVALID_INPUT, "The code is incorrect."),
    );
    useCase.disable.mockResolvedValue(ok(null));
    const { app } = appWith(ANA);
    const { limit } = RATE_LIMITS.mfaFailuresPerAccount;
    for (let i = 0; i < limit; i++) {
      await request(app)
        .post(`${MFA_ROUTE}/enrollment/confirm`)
        .send({ code: "000000" })
        .expect(400);
    }

    const refused = await request(app)
      .post(`${MFA_ROUTE}/disable`)
      .send({ password: "x", code: "123456" });
    const other = await request(appWith({ ...ANA, id: "user-2" }).app)
      .post(`${MFA_ROUTE}/disable`)
      .send({ password: "x", code: "123456" });

    expect(refused.status).toBe(429);
    expect(refused.body.errorCode).toBe("TOO_MANY_REQUESTS");
    expect(other.status).toBe(200);
  });

  it("does not count successful requests", async () => {
    useCase.confirmEnrollment.mockResolvedValue(ok({ recoveryCodes: [] }));
    const { app } = appWith(ANA);

    for (let i = 0; i < RATE_LIMITS.mfaFailuresPerAccount.limit + 2; i++) {
      await request(app)
        .post(`${MFA_ROUTE}/enrollment/confirm`)
        .send({ code: "123456" })
        .expect(200);
    }
  });

  it("answers an unexpected error without details", async () => {
    vi.spyOn(logger, "err").mockImplementation(() => {});
    useCase.status.mockRejectedValue(new Error("secret detail"));

    const response = await request(appWith(ANA).app).get(MFA_ROUTE).expect(500);

    expect(JSON.stringify(response.body)).not.toContain("secret detail");
  });
});
