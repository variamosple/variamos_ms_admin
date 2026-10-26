import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createJwt,
  initKeyStore,
  type SessionUser,
} from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express, { Router } from "express";
import multer from "multer";
import supertest from "supertest";
import { mock, mockDeep } from "vitest-mock-extended";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { AccountLockoutPolicy } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";
import { AccountLockout } from "#src/Domain/User/Service/AccountLockoutService.js";
import { createBaseRouter } from "./index.js";
import type { AccessGuard } from "./requireAccess.js";

/*
 * Authorization of every route, with the real variamos_security (T-17 lot 2,
 * TST-BACK-01). The other router tests replace hasPermissions with a stub that
 * lets everything through: only this file fails when a route loses its
 * permission, gets the wrong one, or a new route is left unguarded.
 */

/** Any signed-in account, whatever its permissions. */
const SIGNED_IN = "signed-in";

/** Routes as declared ("METHOD /path"), with the permission they require. */
const GUARDED: Record<string, string> = {
  "GET /auth/my-account": "my-account::query",
  "PUT /auth/my-account/information": "my-account::update",
  "PUT /auth/password-update": "my-account::update",
  "GET /auth/mfa": "my-account::query",
  "POST /auth/mfa/enrollment": "my-account::update",
  "POST /auth/mfa/enrollment/confirm": "my-account::update",
  "POST /auth/mfa/disable": "my-account::update",
  "DELETE /auth/mfa/trusted-devices": "my-account::update",
  "GET /v1/configurations": "configurations::query",
  "PUT /v1/configurations/:key": "configurations::update",
  "GET /v1/users/:userId/mfa": "users::reset-mfa",
  "DELETE /v1/users/:userId/mfa": "users::reset-mfa",
  "GET /v1/users": "users::query",
  "GET /v1/users/:userId": "users::query",
  "POST /v1/users/:userId/recovery-link": "users::update",
  "PUT /v1/users/:userId/disable": "users::update",
  "PUT /v1/users/:userId/enable": "users::update",
  "DELETE /v1/users/:userId": "users::delete",
  "GET /v1/users/:userId/roles": "users::query",
  "GET /v1/users/:userId/roles/details": "users::query",
  "POST /v1/users/:userId/roles": "roles::assign",
  "DELETE /v1/users/:userId/roles/:roleId": "roles::assign",
  "GET /v1/roles": "roles::query",
  "POST /v1/roles": "roles::create",
  "DELETE /v1/roles/:roleId": "roles::delete",
  "GET /v1/roles/:roleId": "roles::query",
  "PUT /v1/roles/:roleId": "roles::update",
  "GET /v1/roles/:roleId/permissions": "roles::query",
  "POST /v1/roles/:roleId/permissions": "roles::update",
  "DELETE /v1/roles/:roleId/permissions/:permissionId": "roles::update",
  "GET /v1/permissions": "permissions::query",
  "POST /v1/permissions": "permissions::create",
  "DELETE /v1/permissions/:permissionId": "permissions::delete",
  "GET /v1/permissions/:permissionId": "permissions::query",
  "PUT /v1/permissions/:permissionId": "permissions::update",
  "GET /v1/micro-services": "micro-services::query",
  "POST /v1/micro-services/check": "micro-services::query",
  "POST /v1/micro-services/:name/check": "micro-services::query",
  "GET /v1/micro-services/:name/history": "micro-services::query",
  "GET /v1/micro-services/:name/configurations": "micro-services::query",
  "PUT /v1/micro-services/:name/configurations/:key": "micro-services::update",
  "GET /v1/micro-services/:name/audit-logs": "micro-services::query",
  "PUT /v1/micro-services/:name/scale": "micro-services::update",
  "PUT /v1/micro-services/:microserviceId/start": "micro-services::update",
  "PUT /v1/micro-services/:microserviceId/restart": "micro-services::update",
  "PUT /v1/micro-services/:microserviceId/stop": "micro-services::update",
  "GET /v1/micro-services/:microserviceId/logs/watch": "micro-services::query",
  "GET /v1/metrics": "metrics::query",
  "GET /v1/metrics/:metricId": "metrics::query",
  "GET /bugs": "bugs::query",
  "GET /bugs/local": "bugs::query",
  "GET /bugs/repos": "bugs::query",
  "GET /bugs/:id/history": "bugs::query",
  "POST /bugs/:id/status": "bugs::update",
  "POST /bugs/:id/restore": "bugs::update",
  "POST /bugs/:id/reject": "bugs::update",
  "POST /bugs/sync": "bugs::sync",
  "POST /bugs/:id/attachments": "bugs::update",
  "DELETE /bugs/attachments/:id": "bugs::update",
  "POST /bugs/:id/notes": "bugs::update",
  "GET /bugs/:id/notes": "bugs::query",
  "GET /bugs/assignable-users": "bugs::update",
  "PUT /bugs/:id/assignees": "bugs::update",
  "POST /v1/admin/notifications/dispatch": "admin::notifications::dispatch",
  "POST /v1/admin/notifications/recipients/count":
    "admin::notifications::dispatch",
  "GET /v1/activity-logs": "activity-logs::query",
  "GET /v1/access-logs": "activity-logs::query",
  "POST /v1/visits": SIGNED_IN,
  "GET /v1/countries": SIGNED_IN,
  "GET /v1/notifications/access-token": SIGNED_IN,
};

/** Routes open without a session, each for a stated reason. */
const PUBLIC = new Set([
  // Signing in, out and up, and the recovery of a password
  "POST /auth/sign-in",
  "POST /auth/sign-in/mfa",
  "POST /auth/sign-up",
  "POST /auth/logout",
  "POST /auth/google/callback",
  "POST /auth/guest/sign-in",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
  "POST /auth/verify-token",
  "GET /auth/verify-token",
  "GET /auth/password-policy",
  // Reads its own token; answers 401 itself without one
  "GET /auth/session-info",
  // Where to go after signing in
  "POST /auth/redirects",
  // Bug reports may come from anyone; limited per address
  "POST /bugs",
  "GET /bugs/categories",
  // The menu of the shared header, shown before signing in
  "GET /v1/configurations/menu",
  // Monitoring
  "GET /health",
  "GET /version",
]);

const PERMISSIONS = [
  ...new Set(Object.values(GUARDED).filter((p) => p !== SIGNED_IN)),
];

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
};
type RouterProto = { use: (...args: unknown[]) => unknown };

const keyOf = (method: string, path: string) =>
  `${method.toUpperCase()} ${path.replace(/\/$/, "") || "/"}`;

/**
 * Builds the real router and lists its routes. Express 5 does not keep the
 * path a sub-router is mounted at, so `use` is watched while building.
 */
function buildRouter(accessGuard: AccessGuard) {
  const proto = Object.getPrototypeOf(
    Object.getPrototypeOf(Router()),
  ) as RouterProto;
  const original = proto.use;
  const mounts = new Map<unknown, { path: string; child: unknown }[]>();
  proto.use = function (this: unknown, ...args: unknown[]) {
    if (typeof args[0] === "string") {
      for (const child of args.slice(1)) {
        if (typeof child === "function" && "stack" in child) {
          mounts.set(this, [
            ...(mounts.get(this) ?? []),
            { path: args[0], child },
          ]);
        }
      }
    }
    return original.apply(this, args);
  };
  let router: Router;
  try {
    router = createBaseRouter({
      users: mockDeep(),
      bugs: mockDeep(),
      microServices: mockDeep(),
      roles: mockDeep(),
      mfa: mockDeep(),
      notifications: mockDeep(),
      metrics: mock(),
      permissions: mock(),
      visits: mock(),
      countries: mock(),
      configuration: mock(),
      upload: multer(),
      accessGuard,
      accountLockout: new AccountLockout({
        getPolicy: async () => AccountLockoutPolicy.DEFAULT,
      }),
      accessJournal: mock(),
      journalQuery: mock(),
      checkDatabase: mock(),
    });
  } finally {
    proto.use = original;
  }

  const routes = new Set<string>();
  const walk = (current: { stack: Layer[] }, prefix: string) => {
    const children = [...(mounts.get(current) ?? [])];
    for (const layer of current.stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.add(keyOf(method, prefix + layer.route.path));
        }
      } else if (layer.handle.stack) {
        const index = children.findIndex((c) => c.child === layer.handle);
        const mount = index >= 0 ? children.splice(index, 1)[0].path : "";
        walk(layer.handle as { stack: Layer[] }, prefix + mount);
      }
    }
  };
  walk(router as unknown as { stack: Layer[] }, "");
  return { router, routes };
}

const account = (permissions: string[]): SessionUser => ({
  id: "operator-1",
  name: "Operator",
  user: "operator",
  email: "operator@example.com",
  roles: ["Tester"],
  permissions,
});

const tokenFor = (permissions: string[]) =>
  createJwt(account(permissions), "localhost");

/** A request to a declared path, its parameters filled with sample ids. */
const send = (
  app: express.Express,
  route: string,
  token?: string,
): Promise<supertest.Response> => {
  const [method, path] = route.split(" ");
  const request = supertest(app)
    [method.toLowerCase() as "get" | "post" | "put" | "delete"](
      path.replace(/:[A-Za-z]+/g, "7"),
    )
    .timeout(5000);
  return token ? request.set("Cookie", `authToken=${token}`) : request;
};

/** A token signed by a key the service does not know. */
const foreignToken = (): string => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${part({ alg: "RS256" })}.${part({
    sub: "operator-1",
    permissions: PERMISSIONS,
    exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  return `${signed}.${sign("sha256", Buffer.from(signed), privateKey).toString("base64url")}`;
};

describe("authorization of every route (T-17 lot 2)", () => {
  const keyDir = mkdtempSync(join(tmpdir(), "variamos-keys-"));
  const accessGuard = mock<AccessGuard>();
  accessGuard.authorize.mockResolvedValue(new ResponseModel<void>("access"));
  const { router, routes } = buildRouter(accessGuard);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(router);
  const tokens: { all: string; none: string; without: Map<string, string> } = {
    all: "",
    none: "",
    without: new Map(),
  };

  beforeAll(async () => {
    // A key pair of this test only, read the way production reads its own
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privatePath = join(keyDir, "private.pem");
    const publicPath = join(keyDir, "public.pem");
    writeFileSync(
      privatePath,
      privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    writeFileSync(
      publicPath,
      publicKey.export({ type: "spki", format: "pem" }),
    );
    vi.stubEnv("VARIAMOS_PRIVATE_KEY_PATH", privatePath);
    vi.stubEnv("VARIAMOS_PUBLIC_KEY_PATH", publicPath);
    // Tokens valid for ten minutes, whatever the environment file says
    vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", "600");
    await initKeyStore();

    tokens.all = await tokenFor(PERMISSIONS);
    tokens.none = await tokenFor([]);
    for (const permission of PERMISSIONS) {
      tokens.without.set(
        permission,
        await tokenFor(PERMISSIONS.filter((p) => p !== permission)),
      );
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(keyDir, { recursive: true, force: true });
  });

  it("knows every declared route, and only those", () => {
    const declared = [...routes].sort();
    const listed = [...Object.keys(GUARDED), ...PUBLIC].sort();

    expect(declared.filter((route) => !listed.includes(route))).toEqual([]);
    expect(listed.filter((route) => !declared.includes(route))).toEqual([]);
  });

  describe.each(Object.entries(GUARDED))("%s", (route, permission) => {
    it("refuses a request without a session (401)", async () => {
      expect((await send(app, route)).status).toBe(401);
    });

    if (permission === SIGNED_IN) {
      it("lets in any signed-in account", async () => {
        const { status } = await send(app, route, tokens.none);
        expect([401, 403]).not.toContain(status);
      });
      return;
    }

    it(`refuses an account without ${permission} (403)`, async () => {
      const token = tokens.without.get(permission) as string;
      expect((await send(app, route, token)).status).toBe(403);
    });

    it(`lets in an account with ${permission} only`, async () => {
      const token = await tokenFor([permission]);
      const { status } = await send(app, route, token);
      expect([401, 403]).not.toContain(status);
    });
  });

  describe("refuses a token that cannot be trusted (401)", () => {
    const route = "GET /v1/users";

    it("signed by another key", async () => {
      expect((await send(app, route, foreignToken())).status).toBe(401);
    });

    it("whose permissions were changed after signing", async () => {
      const [header, payload, signature] = tokens.none.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      const forged = Buffer.from(
        JSON.stringify({ ...claims, permissions: PERMISSIONS }),
      ).toString("base64url");

      expect(
        (await send(app, route, `${header}.${forged}.${signature}`)).status,
      ).toBe(401);
    });

    it("without a signature", async () => {
      const [, payload] = tokens.all.split(".");
      const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
        "base64url",
      );

      expect((await send(app, route, `${header}.${payload}.`)).status).toBe(
        401,
      );
    });

    it("once expired", async () => {
      vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", "-60");
      const expired = await tokenFor(PERMISSIONS);
      vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", "600");

      expect((await send(app, route, expired)).status).toBe(401);
    });
  });

  it("lets in the account that holds every permission", async () => {
    const { status } = await send(app, "GET /v1/users", tokens.all);
    expect([401, 403]).not.toContain(status);
  });
});
