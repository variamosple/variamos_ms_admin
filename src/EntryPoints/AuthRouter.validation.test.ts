vi.mock("@variamosple/variamos-security", async () => {
  const actual = await vi.importActual<
    typeof import("@variamosple/variamos-security")
  >("@variamosple/variamos-security");
  return {
    ...actual,
    // Protected routes reach their handler: the body is what is tested here
    hasPermissions:
      () =>
      (req: express.Request, _res: express.Response, next: () => void) => {
        req.user = {
          id: "user-123",
          name: "Ana",
          user: "ana",
          email: "ana@example.com",
        };
        next();
      },
  };
});

import cookieParser from "cookie-parser";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { AUTH_ROUTE, createAuthRouter } from "./AuthRouter.js";

const auth = mock<UserAuthUseCase>();
const password = mock<UserPasswordUseCase>();
const management = mock<UserManagementUseCase>();
const mfa = mock<MfaSignInUseCase>();

const app = express();
app.use(express.json());
app.use(cookieParser("secret"));
app.use(
  AUTH_ROUTE,
  createAuthRouter(
    auth,
    password,
    management,
    mock<UserQueryUseCase>(),
    mfa,
    mock<IAccessJournal>(),
  ),
);

const send = (method: "post" | "put", path: string, body: unknown) =>
  supertest(app)
    [method](`${AUTH_ROUTE}${path}`)
    .send(body as object);

const reachedAUseCase = () =>
  [auth, password, management, mfa].some((useCase) =>
    Object.values(useCase).some(
      (fn) =>
        typeof fn === "function" &&
        "mock" in fn &&
        (fn as { mock: { calls: unknown[] } }).mock.calls.length > 0,
    ),
  );

// A value no form sends, recognizable if a response ever echoed it
const SECRET = "echo-me-not";

const routes: Array<{
  method: "post" | "put";
  path: string;
  field: string;
  max: number;
}> = [
  { method: "post", path: "/sign-in", field: "email", max: 254 },
  { method: "post", path: "/sign-in", field: "password", max: 1024 },
  { method: "post", path: "/sign-in/mfa", field: "code", max: 1024 },
  { method: "post", path: "/sign-up", field: "name", max: 255 },
  { method: "post", path: "/sign-up", field: "email", max: 254 },
  { method: "post", path: "/sign-up", field: "password", max: 1024 },
  {
    method: "post",
    path: "/sign-up",
    field: "passwordConfirmation",
    max: 1024,
  },
  { method: "post", path: "/google/callback", field: "credential", max: 8192 },
  {
    method: "put",
    path: "/my-account/information",
    field: "countryCode",
    max: 16,
  },
  {
    method: "put",
    path: "/password-update",
    field: "currentPassword",
    max: 1024,
  },
  { method: "put", path: "/password-update", field: "newPassword", max: 1024 },
  {
    method: "put",
    path: "/password-update",
    field: "passwordConfirmation",
    max: 1024,
  },
  { method: "post", path: "/guest/sign-in", field: "guestId", max: 255 },
  { method: "post", path: "/redirects", field: "url", max: 2048 },
  { method: "post", path: "/forgot-password", field: "email", max: 254 },
  { method: "post", path: "/verify-token", field: "token", max: 1024 },
  { method: "post", path: "/reset-password", field: "token", max: 1024 },
  { method: "post", path: "/reset-password", field: "password", max: 1024 },
];

describe("AuthRouter request bodies (EV-97 lot 6a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(routes)(
    "$method $path refuses a $field that is not text",
    async ({ method, path, field }) => {
      const response = await send(method, path, { [field]: [SECRET] });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(response.body.message).toBe(`The field "${field}" is invalid.`);
      expect(response.text).not.toContain(SECRET);
      expect(reachedAUseCase()).toBe(false);
    },
  );

  it.each(routes)(
    "$method $path refuses a $field longer than $max characters",
    async ({ method, path, field, max }) => {
      const response = await send(method, path, {
        [field]: SECRET.padEnd(max + 1, "x"),
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.message).toBe(`The field "${field}" is invalid.`);
      expect(response.text).not.toContain(SECRET);
      expect(reachedAUseCase()).toBe(false);
    },
  );

  it("refuses a body that is not an object", async () => {
    const response = await send("post", "/sign-in", [SECRET]);

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(response.body.message).toBe("The request is invalid.");
    expect(response.text).not.toContain(SECRET);
  });

  it("refuses an operator object where Sequelize expects an e-mail", async () => {
    const response = await send("post", "/forgot-password", {
      email: { $ne: "" },
    });

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(password.requestReset).not.toHaveBeenCalled();
  });

  it("keeps a missing field for the route to report as before", async () => {
    const response = await send("post", "/sign-in", {});

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(response.body.message).toBe("Email and password are required.");
  });

  it("accepts a null country code, which clears it", async () => {
    management.updateProfile.mockResolvedValue({} as never);

    await send("put", "/my-account/information", { countryCode: null });

    expect(management.updateProfile).toHaveBeenCalled();
  });

  it("drops the fields it does not know", async () => {
    password.requestReset.mockResolvedValue({} as never);

    await send("post", "/forgot-password", {
      email: "ana@example.com",
      isAdmin: true,
    });

    expect(password.requestReset).toHaveBeenCalledWith(
      expect.objectContaining({ data: "ana@example.com" }),
    );
  });
});
