import { createJwt } from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ISecretCipher } from "#src/Domain/Core/Secret/ISecretCipher.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { ITrustedDeviceRepository } from "#src/Domain/Mfa/Repository/ITrustedDeviceRepository.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import { PendingMfaSignIns } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { TrustedDeviceUseCase } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import {
  AUTH_ROUTE,
  createAuthRouter,
  MFA_PENDING_COOKIE,
  MFA_TRUSTED_COOKIE,
} from "./AuthRouter.js";

// The access journal is checked by its own tests (T-24)
const accessJournal = mock<IAccessJournal>();

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

/** Trusted browsers in memory: token hash -> user. */
function memoryTrustedDevices(): ITrustedDeviceRepository & {
  hashes: Map<string, string>;
} {
  const hashes = new Map<string, string>();
  return {
    hashes,
    add: async (userId, tokenHash) => {
      hashes.set(tokenHash, userId);
    },
    use: async (userId, tokenHash) => hashes.get(tokenHash) === userId,
    removeAll: async (userId) => {
      let removed = 0;
      for (const [hash, owner] of hashes) {
        if (owner === userId && hashes.delete(hash)) removed += 1;
      }
      return removed;
    },
  };
}

function setUp(mfaEnabled: boolean, trustedDeviceDays = 14) {
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
  const devices = memoryTrustedDevices();
  const configuration = mock<IConfigurationRepository>();
  configuration.queryByKey.mockImplementation(async () =>
    new ResponseModel<never>("readTrustedDeviceDays").withResponse({
      value: trustedDeviceDays,
    } as never),
  );
  const trustedDevices = new TrustedDeviceUseCase(
    devices,
    configuration,
    mock<ILogger>(),
  );
  const mfaSignIn = new MfaSignInUseCase(
    repository,
    {
      verifySecondFactor: async (_record: UserMfaRecord, code: string) =>
        code === RIGHT_CODE,
    },
    cipher,
    new PendingMfaSignIns(),
    trustedDevices,
    mock<ILogger>(),
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
      accessJournal,
    ),
  );
  return { app, query, repository, devices };
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
      data: { mfaRequired: true, trustedDeviceDays: 14 },
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

  it("records the password step, a wrong code and the right code", async () => {
    const { app } = setUp(true);
    const pending = pendingCookieOf(await signIn(app));
    await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: "000000" });
    await supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: RIGHT_CODE });

    await vi.waitFor(() =>
      expect(
        accessJournal.record.mock.calls.map(([entry]) => [
          entry.event,
          entry.outcome,
          entry.reason,
          entry.userId,
        ]),
      ).toEqual([
        ["sign-in", "success", "mfa_required", "user-1"],
        ["sign-in.mfa", "failed", "wrong_code", "user-1"],
        ["sign-in.mfa", "success", null, "user-1"],
      ]),
    );
  });

  it("records a code sent without a pending sign-in", async () => {
    const { app } = setUp(true);

    await supertest(app).post("/auth/sign-in/mfa").send({ code: RIGHT_CODE });

    await vi.waitFor(() =>
      expect(accessJournal.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "sign-in.mfa",
          outcome: "failed",
          reason: "expired",
          userId: null,
          statusCode: 401,
        }),
      ),
    );
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

    expect(response.headers.location).toMatch(
      /\?mfa=required&trustedDeviceDays=14$/,
    );
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

describe("browsers where the code is not asked (lot 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createJwt).mockResolvedValue("session-jwt");
  });

  /** Signs in with the code, asking or not to trust this browser. */
  const signInWithCode = async (
    app: express.Express,
    body: Record<string, unknown>,
  ) => {
    const pending = pendingCookieOf(await signIn(app));
    return supertest(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", pending)
      .send({ code: RIGHT_CODE, ...body })
      .expect(200);
  };
  const trustedCookieOf = (response: supertest.Response) =>
    cookieNamed(response, MFA_TRUSTED_COOKIE);

  it("trusts the browser only when asked", async () => {
    const { app, devices } = setUp(true);

    const plain = await signInWithCode(app, {});
    const truthy = await signInWithCode(app, { rememberDevice: "true" });
    const asked = await signInWithCode(app, { rememberDevice: true });

    expect(trustedCookieOf(plain)).toBeUndefined();
    expect(trustedCookieOf(truthy)).toBeUndefined();
    const cookie = trustedCookieOf(asked) as string;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain(`Max-Age=${14 * 24 * 60 * 60}`);
    expect(devices.hashes.size).toBe(1);
    // Only the hash is stored
    const token = cookie.split(";")[0]?.split("=")[1] as string;
    expect([...devices.hashes.keys()]).not.toContain(token);
  });

  it("then signs in without the code on that browser only", async () => {
    const { app } = setUp(true);
    const trusted = trustedCookieOf(
      await signInWithCode(app, { rememberDevice: true }),
    ) as string;

    const again = await signIn(app)
      .set("Cookie", trusted.split(";")[0] as string)
      .expect(200);
    const elsewhere = await signIn(app).expect(200);

    expect(again.body.data).toEqual({ redirect: "http://localhost:3000" });
    expect(cookieNamed(again, "authToken")).toContain("session-jwt");
    expect(elsewhere.body.data.mfaRequired).toBe(true);
  });

  it("asks the code again once the browsers are forgotten", async () => {
    const { app, devices } = setUp(true);
    const trusted = trustedCookieOf(
      await signInWithCode(app, { rememberDevice: true }),
    ) as string;

    await devices.removeAll("user-1");
    const response = await signIn(app)
      .set("Cookie", trusted.split(";")[0] as string)
      .expect(200);

    expect(response.body.data.mfaRequired).toBe(true);
  });

  it("neither offers nor trusts a browser when the option is off", async () => {
    const { app, devices } = setUp(true, 0);

    const first = await signIn(app).expect(200);
    const asked = await signInWithCode(app, { rememberDevice: true });

    expect(first.body.data).toEqual({
      mfaRequired: true,
      trustedDeviceDays: 0,
    });
    expect(trustedCookieOf(asked)).toBeUndefined();
    expect(devices.hashes.size).toBe(0);
  });

  it("skips the code of a Google sign-in on a trusted browser", async () => {
    const { app } = setUp(true);
    const trusted = trustedCookieOf(
      await signInWithCode(app, { rememberDevice: true }),
    ) as string;

    const response = await supertest(app)
      .post("/auth/google/callback")
      .set("Cookie", trusted.split(";")[0] as string)
      .send({ credential: "google-token" })
      .expect(302);

    expect(response.headers.location).not.toContain("mfa=required");
    expect(cookieNamed(response, "authToken")).toBeDefined();
  });
});
