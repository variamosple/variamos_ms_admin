import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ISecretCipher } from "#src/Domain/Mfa/Service/ISecretCipher.js";

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Reads a base64 key of 32 bytes; anything else means no key. */
export function parseEncryptionKey(value: string | undefined): Buffer | null {
  if (!value?.trim()) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === KEY_BYTES ? key : null;
}

/**
 * AES-256-GCM, stored as `v1:<base64 of iv, tag and ciphertext>`. The
 * version prefix leaves room for a key rotation.
 */
export class AesGcmSecretCipher implements ISecretCipher {
  public constructor(private readonly key: Buffer | null) {}

  public isAvailable(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error("No MFA encryption key is configured.");
    }
    return this.key;
  }

  public encrypt(plain: Buffer, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.requireKey(), iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    return `${VERSION}:${payload.toString("base64")}`;
  }

  public decrypt(stored: string, context: string): Buffer {
    const [version, data] = stored.split(":");
    if (version !== VERSION || !data) {
      throw new Error("Unknown MFA secret format.");
    }
    const payload = Buffer.from(data, "base64");
    if (payload.length <= IV_BYTES + TAG_BYTES) {
      throw new Error("Unknown MFA secret format.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.requireKey(),
      payload.subarray(0, IV_BYTES),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  }
}
