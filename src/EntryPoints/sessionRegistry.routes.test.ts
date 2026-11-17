import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createJwt,
  initKeyStore,
  isAuthenticated,
  type SessionUser,
} from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { memorySessions } from "#src/Domain/Session/Repository/memorySessions.testing.js";
import { SessionRegistry } from "#src/Domain/Session/UseCase/SessionRegistry.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { webSettingsFromEnv } from "#src/webSettings.js";
import { AUTH_ROUTE, createAuthRouter } from "./AuthRouter.js";
import { SESSION_ID_COOKIE } from "./authWeb.js";
import type { SessionGate } from "./sessionGate.js";
import { refuseEndedSessions } from "./sessionGuard.js";

// EV-74 lot 2: the routes with real signed tokens and a registry in memory
const ada: SessionUser = {
  id: "42",
  name: "Ada Lovelace",
  user: "ada",
  email: "ada@example.com",
  roles: ["Administrator"],
  permissions: ["my-account::update"],
};

const auth = mock<UserAuthUseCase>();
const query = mock<UserQueryUseCase>();
const management = mock<UserManagementUseCase>();

/** The app as the base router builds it: the guard, then the routes. */
function appWith(sessions: SessionGate) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(refuseEndedSessions(sessions));
  app.use(
    AUTH_ROUTE,
    createAuthRouter({
      userAuthUseCase: auth,
      userPasswordUseCase: mock<UserPasswordUseCase>(),
      userManagementUseCase: management,
      userQueryUseCase: query,
      mfaSignIn: mock<MfaSignInUseCase>(),
      accessJournal: mock<IAccessJournal>(),
      sessions,
      web: webSettingsFromEnv().auth,
    }),
  );
  app.get("/v1/protected", isAuthenticated, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

/** A registry whose clock is `offsetMs` ahead of the tokens' own. */
function registryAt(offsetMs = 0) {
  const clock = { now: Date.now() + offsetMs };
  const { repository } = memorySessions(clock);
  const configuration = mock<IConfigurationRepository>();
  configuration.queryByKey.mockResolvedValue(
    new ResponseModel<Configuration>("q").withError(
      DomainErrorCodes.ENTITY_NOT_FOUND,
      "missing",
    ),
  );
  const registry = new SessionRegistry(
    repository,
    configuration,
    mock<ILogger>(),
    () => clock.now,
  );
  return { clock, repository, registry };
}

const cookiesOf = (response: supertest.Response): Record<string, string> => {
  const raw = response.headers["set-cookie"] as string[] | string | undefined;
  const list = [raw ?? []].flat();
  return Object.fromEntries(
    list.map((cookie) => {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      return [pair.slice(0, at), decodeURIComponent(pair.slice(at + 1))];
    }),
  );
};

const cookieHeader = (cookies: Record<string, string | undefined>) =>
  Object.entries(cookies)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

const tokenFor = async (user: SessionUser, expiresInSeconds = 600) => {
  vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", String(expiresInSeconds));
  return (await createJwt(user, undefined)) as string;
};

describe("session registry on the routes (EV-74 lot 2)", () => {
  let keyDir: string;

  beforeAll(async () => {
    keyDir = mkdtempSync(join(tmpdir(), "session-registry-routes-"));
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(join(keyDir, "private.pem"), privateKey);
    writeFileSync(join(keyDir, "public.pem"), publicKey);
    vi.stubEnv("VARIAMOS_PRIVATE_KEY_PATH", join(keyDir, "private.pem"));
    vi.stubEnv("VARIAMOS_PUBLIC_KEY_PATH", join(keyDir, "public.pem"));
    await initKeyStore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    query.sessionUser.mockResolvedValue(
      new ResponseModel<User>("q").withResponse(
        User.builder()
          .setId(ada.id)
          .setName(ada.name)
          .setUser(ada.user)
          .setEmail(ada.email)
          .setRoles(ada.roles ?? [])
          .setPermissions(ada.permissions ?? [])
          .build(),
      ),
    );
  });

  afterAll(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  it("opens a session at sign-in, and ends it at sign-out", async () => {
    const { registry } = registryAt();
    const app = appWith(registry);
    auth.getGuestData.mockResolvedValue(
      new ResponseModel<User>("g").withResponse(
        User.builder()
          .setId("guest-1")
          .setName("Guest")
          .setRoles(["Guest"])
          .build(),
      ),
    );

    vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", "600");
    const signIn = await supertest(app).post("/auth/guest/sign-in").send({});
    expect(signIn.status).toBe(HttpStatusCodes.OK);
    const cookies = cookiesOf(signIn);
    expect(cookies[SESSION_ID_COOKIE]).toMatch(/^[\w-]{43}$/);
    expect(String(signIn.headers["set-cookie"])).toMatch(
      new RegExp(`${SESSION_ID_COOKIE}=[^;]+;.*HttpOnly`),
    );

    const info = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookieHeader(cookies));
    expect(info.status).toBe(HttpStatusCodes.OK);

    const out = await supertest(app)
      .post("/auth/logout")
      .set("Cookie", cookieHeader(cookies));
    expect(out.status).toBe(HttpStatusCodes.OK);
    expect(cookiesOf(out)).toEqual({ authToken: "", [SESSION_ID_COOKIE]: "" });

    // A copy of both cookies made before the sign-out opens nothing now
    const copied = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader(cookies));
    expect(copied.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    expect(copied.body).toMatchObject({
      message: "Your session has ended, please log in again.",
    });
    const again = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookieHeader(cookies));
    expect(again.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    expect(cookiesOf(again)).toEqual({
      authToken: "",
      [SESSION_ID_COOKIE]: "",
    });
  });

  it("refuses a recent token that comes without its session", async () => {
    const { registry } = registryAt(-1_000);
    const app = appWith(registry);
    const authToken = await tokenFor(ada);

    const protectedRoute = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader({ authToken }));
    expect(protectedRoute.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    const header = await supertest(app)
      .get("/v1/protected")
      .set("Authorization", `Bearer ${authToken}`);
    expect(header.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    const info = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookieHeader({ authToken }));
    expect(info.status).toBe(HttpStatusCodes.UNAUTHORIZED);
  });

  it("refuses the session of another account", async () => {
    const { registry } = registryAt(-1_000);
    const app = appWith(registry);
    const adminSession = await registry.open("7");
    const authToken = await tokenFor(ada);

    const response = await supertest(app)
      .get("/v1/protected")
      .set(
        "Cookie",
        cookieHeader({ authToken, [SESSION_ID_COOKIE]: adminSession }),
      );

    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
  });

  it("ends a session idle for more than an hour, even with a valid token", async () => {
    const { clock, registry } = registryAt(-1_000);
    const app = appWith(registry);
    const adminSession = await registry.open(ada.id);
    const authToken = await tokenFor(ada, 7_200);
    const cookie = cookieHeader({
      authToken,
      [SESSION_ID_COOKIE]: adminSession,
    });

    clock.now += 59 * 60_000;
    expect(
      (await supertest(app).get("/v1/protected").set("Cookie", cookie)).status,
    ).toBe(200);
    clock.now += 59 * 60_000;
    expect(
      (await supertest(app).get("/v1/protected").set("Cookie", cookie)).status,
    ).toBe(200);
    clock.now += 60 * 60_000 + 1;
    expect(
      (await supertest(app).get("/v1/protected").set("Cookie", cookie)).status,
    ).toBe(401);
  });

  it("refreshes an expired token while its session is open, and not after", async () => {
    const { clock, registry } = registryAt(-1_000);
    const app = appWith(registry);
    const adminSession = await registry.open(ada.id);
    const authToken = await tokenFor(ada, -60);
    const cookie = cookieHeader({
      authToken,
      [SESSION_ID_COOKIE]: adminSession,
    });

    const refreshed = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookie);
    expect(refreshed.status).toBe(HttpStatusCodes.OK);
    expect(cookiesOf(refreshed).authToken).toBeTruthy();
    // The session keeps its identifier: no new one is opened
    expect(cookiesOf(refreshed)[SESSION_ID_COOKIE]).toBeUndefined();

    clock.now += 61 * 60_000;
    const idle = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookie);
    expect(idle.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    expect(query.sessionUser).toHaveBeenCalledTimes(1);
  });

  it("gives a session to a token issued before the registry, without signing out", async () => {
    const { registry } = registryAt(60_000);
    const app = appWith(registry);
    const legacyToken = await tokenFor(ada, -60);

    const refreshed = await supertest(app)
      .get("/auth/session-info")
      .set("Cookie", cookieHeader({ authToken: legacyToken }));

    expect(refreshed.status).toBe(HttpStatusCodes.OK);
    const cookies = cookiesOf(refreshed);
    expect(cookies[SESSION_ID_COOKIE]).toMatch(/^[\w-]{43}$/);
    expect(
      await registry.check(cookies[SESSION_ID_COOKIE], ada.id, Date.now()),
    ).toBeNull();
    // Still valid, a token of before the registry keeps working meanwhile
    const valid = await tokenFor(ada);
    const meanwhile = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader({ authToken: valid }));
    expect(meanwhile.status).toBe(HttpStatusCodes.OK);
  });

  it("keeps a session for the browser that changes its password", async () => {
    const { registry } = registryAt(-1_000);
    const app = appWith(registry);
    const adminSession = await registry.open(ada.id);
    const authToken = await tokenFor(ada);
    management.updatePassword.mockImplementation(async () => {
      await registry.revokeAllOf(ada.id);
      return new ResponseModel<void>("passwordUpdate");
    });

    const response = await supertest(app)
      .put("/auth/password-update")
      .set(
        "Cookie",
        cookieHeader({ authToken, [SESSION_ID_COOKIE]: adminSession }),
      )
      .send({
        currentPassword: "old-Password-1",
        newPassword: "new-Password-12",
        passwordConfirmation: "new-Password-12",
      });

    expect(response.status).toBe(HttpStatusCodes.OK);
    const renewed = cookiesOf(response)[SESSION_ID_COOKIE];
    expect(renewed).toBeTruthy();
    expect(renewed).not.toBe(adminSession);
    expect(await registry.check(adminSession, ada.id, Date.now())).toBe(
      "revoked",
    );
    expect(await registry.check(renewed, ada.id, Date.now())).toBeNull();
  });

  it("opens no session when the password change is refused", async () => {
    const { registry } = registryAt(-1_000);
    const app = appWith(registry);
    const adminSession = await registry.open(ada.id);
    const authToken = await tokenFor(ada);
    management.updatePassword.mockResolvedValue(
      new ResponseModel<void>("passwordUpdate").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Wrong password",
      ),
    );

    const response = await supertest(app)
      .put("/auth/password-update")
      .set(
        "Cookie",
        cookieHeader({ authToken, [SESSION_ID_COOKIE]: adminSession }),
      )
      .send({
        currentPassword: "wrong-Password-1",
        newPassword: "new-Password-12",
        passwordConfirmation: "new-Password-12",
      });

    expect(response.status).not.toBe(HttpStatusCodes.OK);
    expect(cookiesOf(response)[SESSION_ID_COOKIE]).toBeUndefined();
  });

  it("lets a browser whose session ended sign in again or sign out", async () => {
    const { registry } = registryAt(-1_000);
    const app = appWith(registry);
    const ended = await registry.open(ada.id);
    await registry.revoke(ended);
    const cookie = cookieHeader({
      authToken: await tokenFor(ada),
      [SESSION_ID_COOKIE]: ended,
    });
    auth.getGuestData.mockResolvedValue(
      new ResponseModel<User>("g").withResponse(
        User.builder()
          .setId("guest-1")
          .setName("Guest")
          .setRoles(["Guest"])
          .build(),
      ),
    );

    const signIn = await supertest(app)
      .post("/auth/guest/sign-in")
      .set("Cookie", cookie)
      .send({});
    const signOut = await supertest(app)
      .post("/auth/logout")
      .set("Cookie", cookie);

    expect(signIn.status).toBe(HttpStatusCodes.OK);
    expect(signOut.status).toBe(HttpStatusCodes.OK);
  });

  it("leaves a request without a valid token to its route", async () => {
    const { registry } = registryAt();
    const app = appWith(registry);
    const check = vi.spyOn(registry, "check");

    const none = await supertest(app).get("/v1/protected");
    const forged = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader({ authToken: "not-a-token" }));
    const expired = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader({ authToken: await tokenFor(ada, -60) }));

    expect([none.status, forged.status, expired.status]).toEqual([
      401, 401, 401,
    ]);
    expect(check).not.toHaveBeenCalled();
  });

  it("answers 500 when the registry cannot be read", async () => {
    const sessions = mock<SessionGate>();
    sessions.check.mockRejectedValue(new Error("database down"));
    const app = appWith(sessions);

    const response = await supertest(app)
      .get("/v1/protected")
      .set("Cookie", cookieHeader({ authToken: await tokenFor(ada) }));

    expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(response.body)).not.toContain("database down");
  });

  it("signs out even when the registry cannot be written", async () => {
    const sessions = mock<SessionGate>();
    sessions.revoke.mockRejectedValue(new Error("database down"));
    const app = appWith(sessions);

    const response = await supertest(app)
      .post("/auth/logout")
      .set("Cookie", cookieHeader({ [SESSION_ID_COOKIE]: "s-1" }));

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(sessions.revoke).toHaveBeenCalledWith("s-1");
    expect(cookiesOf(response)).toEqual({
      authToken: "",
      [SESSION_ID_COOKIE]: "",
    });
  });
});
