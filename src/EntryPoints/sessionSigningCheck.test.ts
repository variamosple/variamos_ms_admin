import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initKeyStore } from "@variamosple/variamos-security";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  checkSessionSigning,
  createSessionSigningCheck,
} from "./sessionSigningCheck.js";

describe("checkSessionSigning, with the keys of the service", () => {
  const keyDir = mkdtempSync(join(tmpdir(), "session-signing-"));

  beforeAll(async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    writeFileSync(join(keyDir, "private.pem"), privateKey);
    writeFileSync(join(keyDir, "public.pem"), publicKey);
    vi.stubEnv("VARIAMOS_PRIVATE_KEY_PATH", join(keyDir, "private.pem"));
    vi.stubEnv("VARIAMOS_PUBLIC_KEY_PATH", join(keyDir, "public.pem"));
    await initKeyStore();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(keyDir, { recursive: true, force: true });
  });

  it("signs a session token and verifies it", async () => {
    await expect(checkSessionSigning()).resolves.toEqual({ ok: true });
  });
});

describe("createSessionSigningCheck", () => {
  const signed = () => Promise.resolve("signed-token");

  it("fails when no token can be signed, as without a private key", async () => {
    const check = createSessionSigningCheck({
      // What variamos-security throws when the key store has no private key
      sign: () => Promise.reject(new Error("Error on jwt creation")),
      verify: vi.fn(),
    });
    await expect(check()).resolves.toEqual({
      ok: false,
      reason: "a session token cannot be signed (Error on jwt creation)",
    });
  });

  it("fails when its own token is refused, as with a public key of another pair", async () => {
    const check = createSessionSigningCheck({
      sign: signed,
      verify: () =>
        Promise.resolve({
          errorCode: 401,
          data: undefined,
        }),
    });
    await expect(check()).resolves.toEqual({
      ok: false,
      reason: expect.stringContaining("does not match the private key"),
    });
  });

  it("fails when the verified token names another account", async () => {
    const check = createSessionSigningCheck({
      sign: signed,
      verify: () => Promise.resolve({ data: { sub: "someone-else" } }),
    });
    await expect(check()).resolves.toMatchObject({ ok: false });
  });

  it("signs the probe account and verifies the token it signed", async () => {
    const sign = vi.fn(signed);
    const verify = vi.fn(() =>
      Promise.resolve({ data: { sub: "session-signing-check" } }),
    );
    const check = createSessionSigningCheck({ sign, verify });

    await expect(check()).resolves.toEqual({ ok: true });
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-signing-check", permissions: [] }),
    );
    expect(verify).toHaveBeenCalledWith("signed-token");
  });
});
