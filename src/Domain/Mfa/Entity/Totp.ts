import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 parameters read by every authenticator app. */
export const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
/** Steps accepted before and after the current one (clock drift). */
const TOTP_WINDOW = 1;
/** 160 bits, the size RFC 4226 recommends for HMAC-SHA1. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, without padding, as authenticator apps expect it. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code of one time step (RFC 4226 dynamic truncation, HMAC-SHA1). */
export function totpCode(
  secret: Buffer,
  step: number,
  digits = TOTP_DIGITS,
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Returns the time step the code belongs to, or null. A step at or before
 * `lastUsedStep` is refused, so that a code cannot be replayed.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d+$/.test(given) || given.length !== TOTP_DIGITS) {
    return null;
  }
  const current = totpStep(nowMs);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const step = current + offset;
    if (lastUsedStep !== null && step <= lastUsedStep) {
      continue;
    }
    const expected = totpCode(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      return step;
    }
  }
  return null;
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(
  issuer: string,
  account: string,
  secret: Buffer,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const parameters = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}
