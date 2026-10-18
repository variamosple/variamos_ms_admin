import { randomBytes } from "node:crypto";
import {
  AesGcmSecretCipher,
  parseEncryptionKey,
} from "./AesGcmSecretCipher.js";

const key = randomBytes(32);
const secret = Buffer.from("12345678901234567890");

describe("AesGcmSecretCipher", () => {
  it("decrypts what it encrypted, for the same user", () => {
    const cipher = new AesGcmSecretCipher(key);

    const stored = cipher.encrypt(secret, "user-1");

    expect(stored).toMatch(/^v1:[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain(secret.toString("base64"));
    expect(cipher.decrypt(stored, "user-1")).toEqual(secret);
  });

  it("never gives the same value twice", () => {
    const cipher = new AesGcmSecretCipher(key);

    expect(cipher.encrypt(secret, "user-1")).not.toBe(
      cipher.encrypt(secret, "user-1"),
    );
  });

  it("refuses a secret copied to another user", () => {
    const cipher = new AesGcmSecretCipher(key);
    const stored = cipher.encrypt(secret, "user-1");

    expect(() => cipher.decrypt(stored, "user-2")).toThrow();
  });

  it("refuses an altered value or another key", () => {
    const cipher = new AesGcmSecretCipher(key);
    const stored = cipher.encrypt(secret, "user-1");
    const payload = Buffer.from(stored.slice(3), "base64");
    payload[payload.length - 1] = (payload[payload.length - 1] as number) ^ 1;

    expect(() =>
      cipher.decrypt(`v1:${payload.toString("base64")}`, "user-1"),
    ).toThrow();
    expect(() =>
      new AesGcmSecretCipher(randomBytes(32)).decrypt(stored, "user-1"),
    ).toThrow();
    expect(() => cipher.decrypt("v2:abc", "user-1")).toThrow("format");
    expect(() => cipher.decrypt("v1:", "user-1")).toThrow("format");
  });

  it("is unavailable without a key", () => {
    const cipher = new AesGcmSecretCipher(null);

    expect(cipher.isAvailable()).toBe(false);
    expect(() => cipher.encrypt(secret, "user-1")).toThrow("No MFA");
  });
});

describe("parseEncryptionKey", () => {
  it("accepts 32 bytes in base64", () => {
    expect(parseEncryptionKey(` ${key.toString("base64")} `)).toEqual(key);
  });

  it.each([undefined, "", "  ", randomBytes(16).toString("base64"), "x"])(
    "refuses %j",
    (value) => {
      expect(parseEncryptionKey(value)).toBeNull();
    },
  );
});
