import express, { type RequestHandler } from "express";
import request from "supertest";
import { mock } from "vitest-mock-extended";
import logger from "#src/common/logger.js";
import type { AccessCheck } from "#src/Domain/AccessControl/AccessCheck.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { MfaResetUseCase } from "#src/Domain/Mfa/UseCase/MfaResetUseCase.js";
import type { AccessGuard } from "./requireAccess.js";
import {
  createUserMfaRouter,
  RESET_MFA_PERMISSION,
  USER_MFA_V1_ROUTE,
} from "./UserMfaV1Router.js";

const useCase = mock<MfaResetUseCase>();
const ADMIN = { id: "admin-1", roles: ["Administrator"] };

const ok = <T>(data: T) =>
  new ResponseModel<T>("t").withResponse(data as never);
const failed = (code: DomainErrorCodes, message = "no") =>
  new ResponseModel<never>("t").withError(code, message);

/** The session check as hasPermissions does it, and a scripted hierarchy. */
function appWith(decision: ResponseModel<void> = ok(undefined)) {
  const required: string[][] = [];
  const checks: AccessCheck[] = [];
  const guard = (permissions: string[]): RequestHandler => {
    required.push(permissions);
    return (req, _res, next) => {
      (req as { user?: unknown }).user = ADMIN;
      next();
    };
  };
  const accessGuard: AccessGuard = {
    authorize: async (_operatorId, check) => {
      checks.push(check);
      return decision;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(USER_MFA_V1_ROUTE, createUserMfaRouter(useCase, accessGuard, guard));
  return { app, required, checks };
}

const path = (userId: string) => `/v1/users/${userId}/mfa`;

describe("UserMfaV1Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks users::reset-mfa to read and to turn off", () => {
    const { required } = appWith();

    expect(required).toEqual([[RESET_MFA_PERMISSION], [RESET_MFA_PERMISSION]]);
    expect(RESET_MFA_PERMISSION).toBe("users::reset-mfa");
  });

  it("tells whether the account has a second factor", async () => {
    useCase.status.mockResolvedValue(ok({ enabled: true }));

    const response = await request(appWith().app)
      .get(path("user-2"))
      .expect(200);

    expect(response.body.data).toEqual({ enabled: true });
    expect(useCase.status).toHaveBeenCalledWith(
      "getAccountMfaStatus",
      "user-2",
    );
  });

  it("turns the factor off after the hierarchy check", async () => {
    useCase.reset.mockResolvedValue(ok({ emailSent: true }));
    const { app, checks } = appWith();

    const response = await request(app).delete(path("user-2")).expect(200);

    expect(checks).toEqual([{ kind: "reset-mfa", userId: "user-2" }]);
    expect(useCase.reset).toHaveBeenCalledWith(
      "resetAccountMfa",
      "user-2",
      "admin-1",
    );
    expect(response.body.data).toEqual({ emailSent: true });
  });

  it("refuses when the hierarchy refuses, without touching the factor", async () => {
    const { app } = appWith(
      failed(DomainErrorCodes.FORBIDDEN, "You cannot manage this account."),
    );

    await request(app).delete(path("user-2")).expect(403);

    expect(useCase.reset).not.toHaveBeenCalled();
  });

  it("answers 404 when the account has no second factor", async () => {
    useCase.reset.mockResolvedValue(failed(DomainErrorCodes.ENTITY_NOT_FOUND));

    await request(appWith().app).delete(path("user-2")).expect(404);
  });

  it("answers 500 when the use case throws", async () => {
    vi.spyOn(logger, "err").mockImplementation(() => logger);
    useCase.status.mockRejectedValue(new Error("down"));
    useCase.reset.mockRejectedValue(new Error("down"));
    const { app } = appWith();

    await request(app).get(path("user-2")).expect(500);
    const response = await request(app).delete(path("user-2")).expect(500);

    expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
  });
});
