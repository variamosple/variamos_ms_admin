/**
 * Encrypts the TOTP secrets at rest. `context` (the user id) is bound to the
 * ciphertext, so that a secret copied to another account does not decrypt.
 */
export interface ISecretCipher {
  /** False when no encryption key is configured: enrollment is refused. */
  isAvailable(): boolean;
  encrypt(plain: Buffer, context: string): string;
  /** Throws when the value was altered, or bound to another context. */
  decrypt(stored: string, context: string): Buffer;
}
