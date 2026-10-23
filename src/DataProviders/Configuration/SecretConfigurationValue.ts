import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { ISecretCipher } from "#src/Domain/Core/Secret/ISecretCipher.js";

/** Field of the stored JSON that holds an encrypted value. */
export const ENCRYPTED_FIELD = "$encrypted";

export type EncryptedValue = { [ENCRYPTED_FIELD]: string };

/** The ciphertext is bound to its key: it does not decrypt on another row. */
const contextOf = (key: string) => `configuration:${key}`;

/**
 * Encrypts the value of secret configurations at rest (T-13, EV-78 lot 2).
 * The value is stored as `{"$encrypted": "v1:…"}`, so that a value still in
 * clear can be told apart, row by row.
 */
export class SecretConfigurationValue {
  public constructor(private readonly cipher: ISecretCipher) {}

  /** False without CONFIG_ENCRYPTION_KEY: secrets cannot be written. */
  public canEncrypt(): boolean {
    return this.cipher.isAvailable();
  }

  public static isEncrypted(value: unknown): value is EncryptedValue {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const fields = Object.keys(value);
    return (
      fields.length === 1 &&
      fields[0] === ENCRYPTED_FIELD &&
      typeof (value as Record<string, unknown>)[ENCRYPTED_FIELD] === "string"
    );
  }

  /** Throws without a key: a secret is never written in clear. */
  public encrypt(key: string, value: ConfigurationValue): EncryptedValue {
    const plain = Buffer.from(JSON.stringify(value), "utf8");
    return { [ENCRYPTED_FIELD]: this.cipher.encrypt(plain, contextOf(key)) };
  }

  /**
   * The stored value in clear: as is when not encrypted, null when it cannot
   * be decrypted (no key, another key, altered value).
   */
  public decrypt(key: string, stored: unknown): ConfigurationValue | null {
    if (!SecretConfigurationValue.isEncrypted(stored)) {
      return stored as ConfigurationValue;
    }
    if (!this.cipher.isAvailable()) return null;
    try {
      const plain = this.cipher.decrypt(
        stored[ENCRYPTED_FIELD],
        contextOf(key),
      );
      return JSON.parse(plain.toString("utf8")) as ConfigurationValue;
    } catch {
      return null;
    }
  }
}
