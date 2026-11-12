import type { NextFunction, Request, Response } from "express";
import { mock } from "vitest-mock-extended";

const SIGNED_IN = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  user: "jane",
  roles: ["Admin"],
  permissions: ["my-account::query", "my-account::update"],
};

vi.mock("@variamosple/variamos-security", async () => {
  const actual = await vi.importActual<
    typeof import("@variamosple/variamos-security")
  >("@variamosple/variamos-security");
  return {
    ...actual,
    getToken: vi.fn(),
    validateToken: vi.fn(),
    isSessionExpired: vi.fn(),
    createJwt: vi.fn(),
    hasPermissions:
      () => (req: Request, _res: Response, next: NextFunction) => {
        req.user = SIGNED_IN;
        next();
      },
  };
});

import {
  createJwt,
  isSessionExpired,
  validateToken,
} from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { z } from "zod";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import type { TrustedDeviceUseCase } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import type {
  MfaEnrollment,
  MfaRecoveryCodes,
  MfaStatus,
  UserMfaUseCase,
} from "#src/Domain/Mfa/UseCase/UserMfaUseCase.js";
import { PasswordPolicy } from "#src/Domain/User/Entity/PasswordPolicy.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import {
  AUTH_ROUTE,
  createAuthRouter,
  MFA_PENDING_COOKIE,
} from "../AuthRouter.js";
import { createMfaRouter, MFA_ROUTE } from "../MfaRouter.js";

/*
 * Response contract of the sign-in and own-account routes (EV-98, step 1):
 * the answers keep the shape VariaMosAdmin reads. The schemas copy those of
 * VariaMosAdmin/src/features/auth/api/ (authSchemas, mfaSchemas) and
 * user-management/api/userSchemas; the session info, which the screens
 * read without a schema, follows SessionInfoResponse of
 * @variamosple/variamos-components. They are loose, as there: a field added
 * by the server breaks nothing, a field renamed, removed or of another type
 * fails here first. When the screen reads a new field, add it here in the
 * same pull request.
 */

// VariaMosAdmin/src/shared/api/parseResponse.ts
const envelope = <T extends z.ZodType>(data: T) =>
  z.looseObject({
    transactionId: z.optional(z.string()),
    errorCode: z.optional(z.nullable(z.union([z.number(), z.string()]))),
    message: z.optional(z.string()),
    totalCount: z.optional(z.number()),
    data,
  });
const noData = z.optional(z.nullable(z.undefined()));
// VariaMosAdmin/src/shared/api/schemas.ts
const textOrEmpty = z.nullable(z.string());
const isoDate = z.iso.datetime({ offset: true });

const signedInSchema = z.looseObject({
  id: z.optional(z.string()),
  redirect: z.string(),
});
const mfaRequiredSchema = z.looseObject({
  mfaRequired: z.literal(true),
  trustedDeviceDays: z.optional(z.number()),
});
const sessionInfoSchema = z.looseObject({
  user: z.looseObject({
    id: z.string(),
    user: z.string(),
    name: z.string(),
    email: z.string(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
  authToken: z.optional(z.string()),
  redirect: z.optional(z.string()),
});
const userSchema = z.looseObject({
  id: z.optional(z.string()),
  user: textOrEmpty,
  name: textOrEmpty,
  email: textOrEmpty,
  countryCode: z.optional(z.nullable(z.string())),
  countryName: z.optional(z.nullable(z.string())),
  isEnabled: z.boolean(),
  isDeleted: z.boolean(),
  createdAt: isoDate,
  lastLogin: z.optional(z.nullable(isoDate)),
});
const passwordPolicySchema = z.looseObject({
  minLength: z.number(),
  maxLength: z.number(),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecial: z.boolean(),
});
const mfaStatusSchema = z.looseObject({
  available: z.boolean(),
  enabled: z.boolean(),
  recoveryCodesRemaining: z.number(),
});
const mfaEnrollmentSchema = z.looseObject({
  otpauthUri: z.string(),
  secret: z.string(),
});
const recoveryCodesSchema = z.looseObject({
  recoveryCodes: z.array(z.string()),
});

/** The body follows the schema; the issues name the fields that do not. */
const expectContract = (schema: z.ZodType, body: unknown) => {
  const parsed = schema.safeParse(body);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
};

// The account as the repositories read it at sign-in
const signedInUser = () =>
  User.builder()
    .setId("user-1")
    .setUser("jane")
    .setName("Jane Doe")
    .setEmail("jane@example.com")
    .setRoles(["Admin"])
    .setPermissions(["my-account::query"])
    .build();

const auth = mock<UserAuthUseCase>();
const passwords = mock<UserPasswordUseCase>();
const queries = mock<UserQueryUseCase>();
const mfaSignIn = mock<MfaSignInUseCase>();
const mfa = mock<UserMfaUseCase>();

const app = express();
app.use(express.json());
app.use(cookieParser("secret"));
app.use(
  MFA_ROUTE,
  createMfaRouter(
    mfa,
    mock<Pick<TrustedDeviceUseCase, "forgetAll">>(),
    () => (req, _res, next) => {
      req.user = SIGNED_IN;
      next();
    },
  ),
);
app.use(
  AUTH_ROUTE,
  createAuthRouter({
    userAuthUseCase: auth,
    userPasswordUseCase: passwords,
    userManagementUseCase: mock<UserManagementUseCase>(),
    userQueryUseCase: queries,
    mfaSignIn,
    accessJournal: mock<IAccessJournal>(),
  }),
);

describe("Sign-in and own-account routes keep the shape VariaMosAdmin reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createJwt).mockResolvedValue("session-jwt");
  });

  describe("POST /auth/sign-in", () => {
    const signIn = () =>
      request(app)
        .post("/auth/sign-in")
        .send({ email: "jane@example.com", password: "Right-pass-1" });

    beforeEach(() => {
      auth.signIn.mockResolvedValue(
        new ResponseModel<User>("signIn").withResponse(signedInUser()),
      );
    });

    it("opens the session", async () => {
      mfaSignIn.begin.mockResolvedValue(null);

      const res = await signIn();

      expect(res.status).toBe(200);
      expectContract(envelope(signedInSchema), res.body);
    });

    it("or waits for the second factor", async () => {
      mfaSignIn.begin.mockResolvedValue("pending-token");
      mfaSignIn.trustedDeviceDays.mockResolvedValue(14);

      const res = await signIn();

      expect(res.status).toBe(200);
      expectContract(envelope(mfaRequiredSchema), res.body);
    });

    it("an error keeps its code and message", async () => {
      auth.signIn.mockResolvedValue(
        new ResponseModel<User>("signIn").withError(
          DomainErrorCodes.INVALID_INPUT,
          "Incorrect username or password.",
        ),
      );

      const res = await signIn();

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        errorCode: DomainErrorCodes.INVALID_INPUT,
        message: "Incorrect username or password.",
      });
    });
  });

  it("POST /auth/sign-in/mfa", async () => {
    mfaSignIn.pendingUser.mockReturnValue("user-1");
    mfaSignIn.complete.mockResolvedValue(
      new ResponseModel<string>("signInMfa").withResponse("user-1"),
    );
    queries.sessionUser.mockResolvedValue(
      new ResponseModel<User>("signInMfa").withResponse(signedInUser()),
    );

    const res = await request(app)
      .post("/auth/sign-in/mfa")
      .set("Cookie", `${MFA_PENDING_COOKIE}=pending-token`)
      .send({ code: "123456" });

    expect(res.status).toBe(200);
    expectContract(envelope(signedInSchema), res.body);
  });

  it("POST /auth/guest/sign-in", async () => {
    auth.getGuestData.mockResolvedValue(
      new ResponseModel<User>("signInAsGuest").withResponse(
        User.builder()
          .setId("guest-1")
          .setName("Guest")
          .setUser("Guest")
          .setEmail("guest@variamos.com")
          .setRoles(["Guest"])
          .setPermissions([])
          .build(),
      ),
    );

    const res = await request(app).post("/auth/guest/sign-in").send({});

    expect(res.status).toBe(200);
    expectContract(envelope(signedInSchema), res.body);
  });

  describe("GET /auth/session-info", () => {
    beforeEach(() => {
      vi.mocked(validateToken).mockResolvedValue(
        // The payload of a session token, as variamos-security signs it
        new ResponseModel("validateToken").withResponse({
          sub: SIGNED_IN.id,
          name: SIGNED_IN.name,
          userName: SIGNED_IN.user,
          email: SIGNED_IN.email,
          roles: SIGNED_IN.roles,
          permissions: SIGNED_IN.permissions,
          aud: "localhost",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }) as never,
      );
    });

    it("from a valid session", async () => {
      vi.mocked(isSessionExpired).mockReturnValue(false);

      const res = await request(app).get("/auth/session-info");

      expect(res.status).toBe(200);
      expectContract(envelope(sessionInfoSchema), res.body);
    });

    // The router builds the user from the account read again
    it("from a session refreshed after its expiry", async () => {
      vi.mocked(isSessionExpired).mockReturnValue(true);
      queries.sessionUser.mockResolvedValue(
        new ResponseModel<User>("getSessionInfo").withResponse(signedInUser()),
      );

      const res = await request(app).get("/auth/session-info");

      expect(res.status).toBe(200);
      expectContract(envelope(sessionInfoSchema), res.body);
    });
  });

  it("GET /auth/my-account", async () => {
    queries.myAccount.mockResolvedValue(
      new ResponseModel<User>("myAccount").withResponse(
        User.builder()
          .setId("user-1")
          .setName("Jane Doe")
          .setEmail("jane@example.com")
          .setUser("jane")
          .setCountryCode("CO")
          .setCountryName("Colombia")
          .setIsEnabled(true)
          .setIsDeleted(false)
          .setCreatedAt(new Date("2026-01-10T08:00:00Z"))
          .setLastLogin(new Date("2026-11-02T08:00:00Z"))
          .build(),
      ),
    );

    const res = await request(app).get("/auth/my-account");

    expect(res.status).toBe(200);
    expectContract(envelope(userSchema), res.body);
  });

  it("GET /auth/password-policy", async () => {
    passwords.getPasswordPolicy.mockResolvedValue(
      new ResponseModel<ReturnType<PasswordPolicy["toJSON"]>>(
        "getPasswordPolicy",
      ).withResponse(PasswordPolicy.DEFAULT.toJSON()),
    );

    const res = await request(app).get("/auth/password-policy");

    expect(res.status).toBe(200);
    expectContract(envelope(passwordPolicySchema), res.body);
  });

  describe("two-factor routes of one's own account", () => {
    it("GET /auth/mfa", async () => {
      mfa.status.mockResolvedValue(
        new ResponseModel<MfaStatus>("getMfaStatus").withResponse({
          available: true,
          enabled: true,
          recoveryCodesRemaining: 8,
        }),
      );

      const res = await request(app).get("/auth/mfa");

      expect(res.status).toBe(200);
      expectContract(envelope(mfaStatusSchema), res.body);
    });

    it("POST /auth/mfa/enrollment", async () => {
      mfa.startEnrollment.mockResolvedValue(
        new ResponseModel<MfaEnrollment>("startMfaEnrollment").withResponse({
          otpauthUri: "otpauth://totp/VariaMos:jane@example.com?secret=ABC",
          secret: "ABC",
        }),
      );

      const res = await request(app)
        .post("/auth/mfa/enrollment")
        .send({ password: "Right-pass-1" });

      expect(res.status).toBe(200);
      expectContract(envelope(mfaEnrollmentSchema), res.body);
    });

    it("POST /auth/mfa/enrollment/confirm", async () => {
      mfa.confirmEnrollment.mockResolvedValue(
        new ResponseModel<MfaRecoveryCodes>(
          "confirmMfaEnrollment",
        ).withResponse({
          recoveryCodes: ["aaaa-bbbb", "cccc-dddd"],
        }),
      );

      const res = await request(app)
        .post("/auth/mfa/enrollment/confirm")
        .send({ code: "123456" });

      expect(res.status).toBe(200);
      expectContract(envelope(recoveryCodesSchema), res.body);
    });

    it("POST /auth/mfa/disable answers without data", async () => {
      mfa.disable.mockResolvedValue(new ResponseModel<void>("disableMfa"));

      const res = await request(app)
        .post("/auth/mfa/disable")
        .send({ password: "Right-pass-1", code: "123456" });

      expect(res.status).toBe(200);
      expectContract(envelope(noData), res.body);
    });
  });
});
