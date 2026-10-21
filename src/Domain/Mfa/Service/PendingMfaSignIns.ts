import { randomBytes } from "node:crypto";

/** How long the code may be typed after the password. */
export const MFA_SIGN_IN_TTL_MS = 5 * 60 * 1000;
/** Wrong codes accepted for one password check. */
export const MFA_SIGN_IN_MAX_ATTEMPTS = 5;

interface PendingSignIn {
  userId: string;
  expiresAt: number;
  attempts: number;
  checking: boolean;
}

/**
 * Sign-ins whose password was right and which wait for the second factor
 * (SPC-2026-10-17-001, lot 2). The client only holds an opaque random
 * token: it is not a session and no other service would accept it. Kept in
 * memory, as the service runs as a single instance; a restart only asks for
 * the password again.
 */
export class PendingMfaSignIns {
  private readonly pending = new Map<string, PendingSignIn>();

  public constructor(private readonly now: () => number = Date.now) {}

  public create(userId: string): string {
    this.prune();
    const token = randomBytes(32).toString("base64url");
    this.pending.set(token, {
      userId,
      expiresAt: this.now() + MFA_SIGN_IN_TTL_MS,
      attempts: 0,
      checking: false,
    });
    return token;
  }

  /** The user waiting behind the token, or null when unknown or expired. */
  public find(token: string): string | null {
    const entry = this.pending.get(token);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.pending.delete(token);
      return null;
    }
    return entry.userId;
  }

  /**
   * Starts checking a code: one at a time per token, so that parallel
   * requests cannot try many codes at once. False when one is running.
   */
  public claim(token: string): boolean {
    const entry = this.pending.get(token);
    if (!entry || entry.checking) return false;
    entry.checking = true;
    entry.attempts += 1;
    return true;
  }

  /** Ends a wrong attempt; the token ends at the last allowed one. */
  public release(token: string): void {
    const entry = this.pending.get(token);
    if (!entry) return;
    entry.checking = false;
    if (entry.attempts >= MFA_SIGN_IN_MAX_ATTEMPTS) {
      this.pending.delete(token);
    }
  }

  public remove(token: string): void {
    this.pending.delete(token);
  }

  private prune(): void {
    const now = this.now();
    for (const [token, entry] of this.pending) {
      if (now >= entry.expiresAt) this.pending.delete(token);
    }
  }
}
