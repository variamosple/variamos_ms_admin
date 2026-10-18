import { createHash, randomBytes } from "node:crypto";
import { base32Encode } from "./Totp.js";

export const RECOVERY_CODE_COUNT = 10;
/** 10 base32 characters: 50 random bits per code. */
const RECOVERY_CODE_LENGTH = 10;

/** Lowercase, without the separator nor spaces, as typed or as printed. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

/**
 * Codes are stored as a SHA-256 hash: they are random and long enough that
 * a slow hash adds nothing, and a hash lets one be found in a single query.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Codes shown once to the user, as `xxxxx-xxxxx`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const raw = base32Encode(randomBytes(8))
      .slice(0, RECOVERY_CODE_LENGTH)
      .toLowerCase();
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}
