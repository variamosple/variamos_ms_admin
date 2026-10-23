/**
 * Encrypts secrets at rest: TOTP secrets, secret configurations. `context`
 * (a user id, a configuration key) is bound to the ciphertext, so that a
 * value copied to another row does not decrypt.
 */
export interface ISecretCipher {
  /** False when no encryption key is configured. */
  isAvailable(): boolean;
  encrypt(plain: Buffer, context: string): string;
  /** Throws when the value was altered, or bound to another context. */
  decrypt(stored: string, context: string): Buffer;
}
