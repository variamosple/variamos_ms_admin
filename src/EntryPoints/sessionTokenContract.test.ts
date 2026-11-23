import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createJwt,
  initKeyStore,
  type SessionUser,
} from "@variamosple/variamos-security";
import { decodeJwt } from "jose";
import { z } from "zod";

/**
 * The session token as vms_projects reads it: the Python package
 * variamos-security validates the payload into its SessionInfo model. That
 * validation ignores the fields it does not know, and refuses a field of the
 * wrong type: with 0.0.2, a list in "aud" made every authenticated request
 * to vms_projects answer 500 (admin #183, reverted by #184). Since 0.0.3
 * (variamos_security #12, on PyPI and in vms_projects since 2026-11-24),
 * "aud" is a string or a list, and "iss" is read.
 *
 * Change this schema only once the Python package accepts the new shape and
 * vms_projects runs it in production.
 */
const PythonSessionInfo = z.looseObject({
  sub: z.string(),
  name: z.string(),
  userName: z.string(),
  email: z.string(),
  roles: z.array(z.string()).nullish(),
  permissions: z.array(z.string()).nullish(),
  iss: z.string().nullish(),
  aud: z.union([z.string(), z.array(z.string())]).nullish(),
  iat: z.int().nullish(),
  exp: z.int().nullish(),
});

const sessionUser: SessionUser = {
  id: "42",
  name: "Ada Lovelace",
  user: "ada",
  email: "ada@example.com",
  roles: ["Administrator"],
  permissions: ["admin::projects::query"],
};

describe("session token read by vms_projects (Python variamos-security 0.0.3)", () => {
  let keyDir: string;

  beforeAll(async () => {
    // A key pair of the test alone, written where the library reads it
    keyDir = mkdtempSync(join(tmpdir(), "session-token-contract-"));
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

  afterAll(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  // The admin passes the host of the page to go back to, or the cookie
  // domain, which can be empty
  it.each([
    [
      "the host of the page to go back to",
      "app.variamos.com",
      ["variamos-platform", "app.variamos.com"],
    ],
    ["no host", undefined, "variamos-platform"],
  ])("stays readable with %s as audience", async (_case, host, aud) => {
    const token = (await createJwt(sessionUser, host)) as string;
    const payload = decodeJwt(token);

    expect(PythonSessionInfo.safeParse(payload).error?.issues).toBeUndefined();
    expect(payload.iss).toBe("variamos_ms_admin");
    expect(payload.aud).toEqual(aud);
  });
});
