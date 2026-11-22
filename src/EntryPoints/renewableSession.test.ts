import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createJwt,
  initKeyStore,
  type SessionUser,
} from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { canRenewSession, renewableSession } from "./renewableSession.js";

const MINUTE_MS = 60 * 1000;
// Shorter than in production: the session lives 15 minutes, its cookie 1 h
const COOKIE_MAX_AGE_MS = 60 * MINUTE_MS;

const sessionUser: SessionUser = {
  id: "42",
  name: "Ada Lovelace",
  user: "ada",
  email: "ada@example.com",
  roles: ["User"],
  permissions: [],
};

const appBehind = () => {
  const app = express();
  app.use(cookieParser());
  app.get("/probe", renewableSession(COOKIE_MAX_AGE_MS), (req, res) => {
    res.json({ user: req.user?.id });
  });
  return app;
};

describe("canRenewSession", () => {
  const issuedAt = 1_000_000;

  it("allows a refresh within the cookie lifetime, not after", () => {
    const end = issuedAt * 1000 + COOKIE_MAX_AGE_MS;
    expect(canRenewSession(issuedAt, COOKIE_MAX_AGE_MS, end)).toBe(true);
    expect(canRenewSession(issuedAt, COOKIE_MAX_AGE_MS, end + 1)).toBe(false);
  });

  it("refuses a token without issue time", () => {
    expect(canRenewSession(undefined, COOKIE_MAX_AGE_MS, 0)).toBe(false);
  });
});

describe("renewableSession (ADM-N19)", () => {
  let keyDir: string;
  const start = new Date("2026-11-22T10:00:00Z");

  beforeAll(async () => {
    // A key pair of the test alone, written where the library reads it
    keyDir = mkdtempSync(join(tmpdir(), "renewable-session-"));
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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  const sessionAt = async (minutesLater: number) => {
    const token = (await createJwt(sessionUser)) as string;
    vi.setSystemTime(start.getTime() + minutesLater * MINUTE_MS);
    return request(appBehind())
      .get("/probe")
      .set("Cookie", `authToken=${token}`);
  };

  it("lets a valid session through", async () => {
    const response = await sessionAt(1);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: "42" });
  });

  it("lets through an expired session that session-info would refresh", async () => {
    const response = await sessionAt(16);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: "42" });
  });

  it("refuses a session expired past its cookie lifetime", async () => {
    const response = await sessionAt(61);

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED_ACCESS");
  });

  it("refuses a forged or missing session", async () => {
    const forged = await request(appBehind())
      .get("/probe")
      .set("Cookie", "authToken=not.a.token");
    const missing = await request(appBehind()).get("/probe");

    expect(forged.status).toBe(401);
    expect(missing.status).toBe(401);
  });
});
