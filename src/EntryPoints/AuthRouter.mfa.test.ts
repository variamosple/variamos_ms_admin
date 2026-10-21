import { createJwt } from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import type { ISecretCipher } from "#src/Domain/Mfa/Service/ISecretCipher.js";
import { PendingMfaSignIns } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import {
  AUTH_ROUTE,
  createAuthRouter,
  MFA_PENDING_COOKIE,
} from "./AuthRouter.js";

vi.mock("@variamosple/variamos-security", async () => {
  const actual = await vi.importActual<
    typeof import("@variamosple/variamos-security")
  >("@variamosple/variamos-security");
  return { ...actual, createJwt: vi.fn() };
});

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    public verifyIdToken() {
      return Promise.resolve({
        getPayload: () => ({ name: "Ana", email: "ana@example.com" }),
      });
    }
  },
}));

const RIGHT_CODE = "123456";
const ana = () =>
  User.builder()
    .setId("user-1")
    .setName("Ana")
    .setUser("ana")
    .setEmail("ana@example.com")
    .setRoles(["Viewer"])
    .setPermissions(["my-account::query"])
    .build();

function setUp(mfaEnabled: boolean) {
  const auth = mock<UserAuthUseCase>();
  const query = mock<UserQueryUseCase>();
  auth.signIn.mockResolvedValue(
    new ResponseModel<User>("signIn").withResponse(ana()),
  );
  auth.findOrCreate.mockResolvedValue(
    new ResponseModel<User>("loginWithGoogle").withResponse(ana()),
  );
  query.sessionUser.mockResolvedValue(
    new ResponseModel<User>("signInMfa").withResponse(ana()),
  );
  const repository = mock<IUserMfaRepository>();
  repository.findByUser.mockResolvedValue(
    mfaEnabled
      ? {
          userId: "user-1",
          secretEncrypted: "v1:x",
          enabledAt: new Date(),
          lastUsedStep: null,
        }
      : null,
  );
  const cipher = mock<ISecretCipher>();
  cipher.isAvailable.mockReturnValue(true);
  const mfaSignIn = new MfaSignInUseCase(
    repository,
    {
      verifySecondFactor: async (_record: UserMfaRecord, code: string) =>
        code === RIGHT_CODE,
    },
    cipher,
    new PendingMfaSignIns(),
  );

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser("secret"));
  app.use(
    AUTH_ROUTE,
    createAuthRouter(
      auth,
      mock<UserPasswordUseCase>(),
      mock<UserManagementUseCase>(),
      query,
      mfaSignIn,
    ),
  );
  return { app, query, repository };
}

const cookiesOf = (response: supertest.Response): string[] => {
  const raw = response.headers["set-cookie"] as unknown;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [String(raw)];
};
const cookieNamed = (response: supertest.Response, name: string) =>
  cookiesOf(response).find((c) => c.startsWith(`${name}=`));

/** The pending cookie, as the browser sends it back. */
const pendingCookieOf = (response: supertest.Response): string =>
  (cookieNamed(response, MFA_PENDING_COOKIE) as string).split(";")[0] as string;

const signIn = (app: express.Express) =>
  supertest(app)
    .post("/auth/sign-in")
    .send({ email: "ana@example.com", password: "Right-pass-1" });

describe("sign-in with a second factor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createJwt).mockResolvedValue("session-jwt");
  });

  it("signs in an account without second factor as before", async () => {
    const { app } = setUp(false);

    const response = await signIn(app).expect(200);

    expect(response.body).toEqual({
      transactionId: "signIn",
      data: { redirect: "http://localhost:3000" },
    });
    expect(cookieNamed(response, "authToken")).toBeDefined();
    expect(cookieNamed(response, MFA_PENDING_COOKIE)).toBeUndefined();
  });

  it("asks for the code, without a session, after the right password", async () => {
    const { app } = setUp(true);

    const response = await signIn(app).expect(200);

    expect(response.body).toEqual({
      transactionId: "signIn",
      data: { mfaRequired: true },
    });
    expect(cookieNamed(response, "authToken")).toBeUndefined();
    expect(createJwt).not.toHaveBeenCalled();
    const pending = cookieNamed(response, MFA_PENDING_COOKIE) as string;
    expect(pending).toContain("HttpOnly");
    expect(pending).toContain("SameSite=Strict");
    expect(pending).toContain("Max-Age=300");
  });

  it("opens the session once the code is right", async () => {
    const { app, query } = setUp(true);
    const pending = pendingCookieOf(await signIn(app));

    const response = await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: RIGHT_CODE })
      .expect(200);

    expect(response.body.data).toEqual({ redirect: "http://localhost:3000" });
    expect(cookieNamed(response, "authToken")).toContain("session-jwt");
    expect(cookieNamed(response, MFA_PENDING_COOKIE)).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    expect(query.sessionUser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createJwt).mock.calls[0]?.[0]).toMatchObject({
      id: "user-1",
      email: "ana@example.com",
      roles: ["Viewer"],
    });
  });

  it("refuses a wrong code and keeps the sign-in pending", async () => {
    const { app } = setUp(true);
    const pending = pendingCookieOf(await signIn(app));

    const wrong = await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: "000000" })
      .expect(400);
    const right = await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: RIGHT_CODE });

    expect(wrong.body.message).toBe("The code is incorrect.");
    expect(cookieNamed(wrong, "authToken")).toBeUndefined();
    expect(right.status).toBe(200);
  });

  it("refuses the code without a pending sign-in", async () => {
    const { app } = setUp(true);

    const response = await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", `${MFA_PENDING_COOKIE}=forged`)
      .send({ code: RIGHT_CODE })
      .expect(401);

    expect(response.body.errorCode).toBe("UNAUTHORIZED_ACCESS");
    expect(createJwt).not.toHaveBeenCalled();
  });

  it.each([{}, { code: "" }, { code: 123456 }, { code: "1".repeat(33) }])(
    "refuses the body %j",
    async (body) => {
      const { app } = setUp(true);

      await supertest(app).post("/auth/sign-in/mfa").send(body).expect(400);
    },
  );

  it("refuses an account disabled since the password", async () => {
    const { app, query } = setUp(true);
    const pending = pendingCookieOf(await signIn(app));
    query.sessionUser.mockResolvedValue(
      new ResponseModel<User>("signInMfa").withError(
        DomainErrorCodes.UNAUTHORIZED_ACCESS,
        "Disabled",
      ),
    );

    await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: RIGHT_CODE })
      .expect(401);

    expect(createJwt).not.toHaveBeenCalled();
  });

  it("fails the sign-in rather than skip the code when storage fails", async () => {
    const { app, repository } = setUp(true);
    repository.findByUser.mockRejectedValue(new Error("connection lost"));

    const response = await signIn(app).expect(500);

    expect(cookieNamed(response, "authToken")).toBeUndefined();
  });

  it("sends a Google account with a second factor to the code page", async () => {
    const { app } = setUp(true);

    const response = await supertest(app)
      .post("/auth/google/callback")
      .send({ credential: "google-token" })
      .expect(302);

    expect(response.headers.location).toMatch(/\?mfa=required$/);
    expect(cookieNamed(response, "authToken")).toBeUndefined();
    expect(cookieNamed(response, MFA_PENDING_COOKIE)).toBeDefined();
  });

  it("signs in a Google account without second factor as before", async () => {
    const { app } = setUp(false);

    const response = await supertest(app)
      .post("/auth/google/callback")
      .send({ credential: "google-token" })
      .expect(302);

    expect(response.headers.location).not.toContain("mfa=required");
    expect(cookieNamed(response, "authToken")).toBeDefined();
  });
});
