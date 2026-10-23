import { randomBytes } from "node:crypto";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import {
  ENCRYPTED_FIELD,
  SecretConfigurationValue,
} from "./SecretConfigurationValue.js";

const KEY = "notification.smtp.password";

describe("SecretConfigurationValue", () => {
  const secrets = new SecretConfigurationValue(
    new AesGcmSecretCipher(randomBytes(32)),
  );

  it.each([
    ["a text", "smtp-password"],
    ["a number", 587],
    ["a boolean", true],
    ["a list", ["a", "b"]],
    ["an object", { user: "u", password: "p" }],
  ])("stores %s encrypted and reads it back with its type", (_label, value) => {
    const stored = secrets.encrypt(KEY, value);

    expect(Object.keys(stored)).toEqual([ENCRYPTED_FIELD]);
    expect(stored[ENCRYPTED_FIELD]).toMatch(/^v1:/);
    expect(JSON.stringify(stored)).not.toContain(JSON.stringify(value));
    expect(secrets.decrypt(KEY, stored)).toEqual(value);
  });

  it("gives a value still in clear as it is", () => {
    expect(secrets.decrypt(KEY, "smtp-password")).toBe("smtp-password");
    expect(secrets.decrypt(KEY, { user: "u" })).toEqual({ user: "u" });
  });

  it("does not decrypt a value moved to another key", () => {
    const stored = secrets.encrypt(KEY, "smtp-password");

    expect(secrets.decrypt("notification.smtp.user", stored)).toBeNull();
  });

  it("does not decrypt with another key, an altered value or no key", () => {
    const stored = secrets.encrypt(KEY, "smtp-password");
    const altered = {
      [ENCRYPTED_FIELD]: `${stored[ENCRYPTED_FIELD].slice(0, -4)}AAAA`,
    };
    const otherKey = new SecretConfigurationValue(
      new AesGcmSecretCipher(randomBytes(32)),
    );
    const noKey = new SecretConfigurationValue(new AesGcmSecretCipher(null));

    expect(otherKey.decrypt(KEY, stored)).toBeNull();
    expect(secrets.decrypt(KEY, altered)).toBeNull();
    expect(noKey.decrypt(KEY, stored)).toBeNull();
  });

  it("never encrypts without a key", () => {
    const noKey = new SecretConfigurationValue(new AesGcmSecretCipher(null));

    expect(noKey.canEncrypt()).toBe(false);
    expect(() => noKey.encrypt(KEY, "smtp-password")).toThrow();
  });

  it.each([
    [{ [ENCRYPTED_FIELD]: "v1:abc" }, true],
    [{ [ENCRYPTED_FIELD]: "v1:abc", other: 1 }, false],
    [{ [ENCRYPTED_FIELD]: 3 }, false],
    [["v1:abc"], false],
    ["v1:abc", false],
    [null, false],
  ])("tells an encrypted value apart: %j", (value, expected) => {
    expect(SecretConfigurationValue.isEncrypted(value)).toBe(expected);
  });
});
