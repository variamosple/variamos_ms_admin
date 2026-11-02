import type { NextFunction, Request, Response } from "express";
import { mock } from "vitest-mock-extended";

vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as { user?: { id: string } }).user = { id: "admin-1" };
    next();
  },
}));

import express from "express";
import request from "supertest";
import { z } from "zod";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  AccountMfaStatus,
  MfaResetResult,
  MfaResetUseCase,
} from "#src/Domain/Mfa/UseCase/MfaResetUseCase.js";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import { Role } from "#src/Domain/Role/Entity/Role.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRole } from "#src/Domain/User/Entity/UserRole.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import type { UserRoleUseCase } from "#src/Domain/User/UseCase/UserRoleUseCase.js";
import type { AccessGuard } from "../requireAccess.js";
import { createUserMfaRouter, USER_MFA_V1_ROUTE } from "../UserMfaV1Router.js";
import { createUserRolesRouter } from "../UserRolesV1Router.js";
import { createUsersRouter, USERS_V1_ROUTE } from "../UsersV1Router.js";

/*
 * Response contract of the account routes (EV-98, step 1): the answers keep
 * the shape VariaMosAdmin reads. The schemas copy those of
 * VariaMosAdmin/src/features/user-management/api/ (userSchemas,
 * accountMfaSchemas, userRoleSchemas) and role-management/api/roleSchemas;
 * they are loose, as there: a field added by the server breaks nothing, a
 * field renamed, removed or of another type fails here first. When the
 * screen reads a new field, add it here in the same pull request.
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
// VariaMosAdmin/src/shared/api/schemas.ts
const textOrEmpty = z.nullable(z.string());
const isoDate = z.iso.datetime({ offset: true });

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
const recoveryLinkSchema = z.looseObject({ recoveryUrl: z.string() });
const accountMfaStatusSchema = z.looseObject({ enabled: z.boolean() });
const accountMfaResetSchema = z.looseObject({ emailSent: z.boolean() });
const roleSchema = z.looseObject({
  id: z.optional(z.number()),
  name: z.string(),
});
const roleDetailsSchema = z.array(
  z.looseObject({
    id: z.optional(z.number()),
    name: z.string(),
    permissions: z.optional(
      z.array(z.looseObject({ id: z.optional(z.number()), name: z.string() })),
    ),
  }),
);
const userRoleSchema = z.looseObject({
  userId: z.string(),
  roleId: z.number(),
});

/** The body follows the schema; the issues name the fields that do not. */
const expectContract = (schema: z.ZodType, body: unknown) => {
  const parsed = schema.safeParse(body);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
};

// An account with every field the repository fills, and one that never
// signed in, without country
const fullUser = () =>
  User.builder()
    .setId("user-1")
    .setUser("jane")
    .setName("Jane Doe")
    .setEmail("jane@example.com")
    .setCountryCode("CO")
    .setCountryName("Colombia")
    .setIsEnabled(true)
    .setIsDeleted(false)
    .setCreatedAt(new Date("2026-01-10T08:00:00Z"))
    .setLastLogin(new Date("2026-11-02T08:00:00Z"))
    .build();
const newUser = () =>
  User.builder()
    .setId("user-2")
    .setUser("new")
    .setName("New")
    .setEmail("new@example.com")
    .setIsEnabled(false)
    .setIsDeleted(false)
    .setCreatedAt(new Date("2026-11-01T08:00:00Z"))
    .build();

const queries = mock<UserQueryUseCase>();
const passwords = mock<UserPasswordUseCase>();
const roles = mock<UserRoleUseCase>();
const mfaReset = mock<MfaResetUseCase>();
const allowAll: AccessGuard = {
  authorize: async () => new ResponseModel<void>("authorizeAccess"),
};
const passPermissions =
  () => (_req: Request, _res: Response, next: NextFunction) =>
    next();

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as { user?: { id: string } }).user = { id: "admin-1" };
  next();
});
app.use(
  USER_MFA_V1_ROUTE,
  createUserMfaRouter(mfaReset, allowAll, passPermissions),
);
app.use(
  USERS_V1_ROUTE,
  createUsersRouter(
    queries,
    passwords,
    mock<UserManagementUseCase>(),
    createUserRolesRouter(roles, allowAll),
    allowAll,
  ),
);

describe("Account routes keep the shape VariaMosAdmin reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /v1/users", async () => {
    queries.queryList.mockResolvedValue(
      new ResponseModel<User[]>("tx", undefined, undefined, 2).withResponse([
        fullUser(),
        newUser(),
      ]),
    );

    const res = await request(app).get("/v1/users");

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(userSchema)), res.body);
  });

  it("GET /v1/users/:id", async () => {
    queries.queryById.mockResolvedValue(
      new ResponseModel<User>("tx").withResponse(fullUser()),
    );

    const res = await request(app).get("/v1/users/user-1");

    expect(res.status).toBe(200);
    expectContract(envelope(userSchema), res.body);
  });

  it("POST /v1/users/:id/recovery-link", async () => {
    passwords.generateLink.mockResolvedValue(
      new ResponseModel<{ recoveryUrl: string }>("tx").withResponse({
        recoveryUrl: "https://admin.example.com/#/reset-password?token=t",
      }),
    );

    const res = await request(app).post("/v1/users/user-1/recovery-link");

    expect(res.status).toBe(200);
    expectContract(envelope(recoveryLinkSchema), res.body);
  });

  it("GET /v1/users/:id/mfa", async () => {
    mfaReset.status.mockResolvedValue(
      new ResponseModel<AccountMfaStatus>("tx").withResponse({ enabled: true }),
    );

    const res = await request(app).get("/v1/users/user-1/mfa");

    expect(res.status).toBe(200);
    expectContract(envelope(accountMfaStatusSchema), res.body);
  });

  it("DELETE /v1/users/:id/mfa", async () => {
    mfaReset.reset.mockResolvedValue(
      new ResponseModel<MfaResetResult>("tx").withResponse({ emailSent: true }),
    );

    const res = await request(app).delete("/v1/users/user-1/mfa");

    expect(res.status).toBe(200);
    expectContract(envelope(accountMfaResetSchema), res.body);
  });

  it("GET /v1/users/:id/roles", async () => {
    roles.queryUserRoles.mockResolvedValue(
      new ResponseModel<Role[]>("tx").withResponse([new Role(1, "Admin")]),
    );

    const res = await request(app).get("/v1/users/user-1/roles");

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(roleSchema)), res.body);
  });

  it("GET /v1/users/:id/roles/details", async () => {
    roles.queryUserRolesDetails.mockResolvedValue(
      new ResponseModel<Role[]>("tx").withResponse([
        new Role(1, "Admin", [new Permission(4, "users::query")]),
      ]),
    );

    const res = await request(app).get("/v1/users/user-1/roles/details");

    expect(res.status).toBe(200);
    expectContract(envelope(roleDetailsSchema), res.body);
  });

  it("POST /v1/users/:id/roles", async () => {
    roles.createUserRole.mockResolvedValue(
      new ResponseModel<UserRole>("tx").withResponse(new UserRole("user-1", 1)),
    );

    const res = await request(app)
      .post("/v1/users/user-1/roles")
      .send({ roleId: 1 });

    expect(res.status).toBe(201);
    expectContract(envelope(userRoleSchema), res.body);
  });

  it("an error keeps its code and message", async () => {
    queries.queryById.mockResolvedValue(
      new ResponseModel<User>("tx").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "User not found.",
      ),
    );

    const res = await request(app).get("/v1/users/user-1");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      errorCode: DomainErrorCodes.ENTITY_NOT_FOUND,
      message: "User not found.",
    });
  });
});
