import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { AccountLockoutPolicy } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";

export const ACCOUNT_LOCKOUT_KEYS = {
  maxAttempts: "security.lockout.max_attempts",
  durationMinutes: "security.lockout.duration_minutes",
} as const;

export interface IAccountLockoutPolicyProvider {
  getPolicy(): Promise<AccountLockoutPolicy>;
}

/** The fixed default, for callers and tests without configuration. */
export const DEFAULT_ACCOUNT_LOCKOUT_POLICY_PROVIDER: IAccountLockoutPolicyProvider =
  { getPolicy: async () => AccountLockoutPolicy.DEFAULT };

/**
 * Reads the security.lockout.* keys at each sign-in, so that a change on the
 * configuration screen applies from the next attempt. A key that cannot be
 * read takes the default.
 */
export class AccountLockoutPolicyService
  implements IAccountLockoutPolicyProvider
{
  public constructor(
    private readonly configurationRepository: IConfigurationRepository,
    private readonly logger: ILogger,
  ) {}

  private async read(key: string): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("readAccountLockoutPolicy", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch (error) {
      this.logger.warn(`Could not read ${key}: ${(error as Error).message}`);
      return undefined;
    }
  }

  public async getPolicy(): Promise<AccountLockoutPolicy> {
    const [maxAttempts, durationMinutes] = await Promise.all([
      this.read(ACCOUNT_LOCKOUT_KEYS.maxAttempts),
      this.read(ACCOUNT_LOCKOUT_KEYS.durationMinutes),
    ]);
    return AccountLockoutPolicy.fromConfiguration({
      maxAttempts,
      durationMinutes,
    });
  }
}

/** Reported once the failure that locks the account is recorded. */
export interface AccountLocked {
  attempts: number;
  durationMinutes: number;
}

/** The outcome of one sign-in attempt, reported once it is known. */
export interface SignInAttempt {
  succeeded(): void;
  /** Returns the lock when this failure locks the account. */
  failed(): AccountLocked | null;
  /** No answer on the credentials (server error, client gone): not counted. */
  abandoned(): void;
}

export type SignInAdmission =
  | { locked: true; retryAfterMs: number }
  | { locked: false; attempt: SignInAttempt };

interface FailureCount {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number | null;
}

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Failed sign-ins in a row, per account (EV-87 lot 4). Accounts that do not
 * exist are counted the same way, so the answer never tells whether an
 * account exists. An attempt is counted when it starts, so that parallel
 * requests cannot go past the limit. Kept in memory: the service runs as a
 * single instance, and a restart clears the counts.
 */
export class AccountLockout {
  private readonly counts = new Map<string, FailureCount>();
  private lastSweepAt = 0;

  public constructor(
    private readonly policyProvider: IAccountLockoutPolicyProvider,
    private readonly now: () => number = Date.now,
  ) {}

  /** Admits an attempt on the account, or tells how long it stays locked. */
  public async admit(account: string): Promise<SignInAdmission> {
    const policy = await this.policyProvider.getPolicy();
    const now = this.now();
    this.sweep(now, policy.durationMs);

    let count = this.counts.get(account);
    if (count && this.isStale(count, now, policy.durationMs)) {
      this.counts.delete(account);
      count = undefined;
    }
    if (count?.lockedUntil && now < count.lockedUntil) {
      return { locked: true, retryAfterMs: count.lockedUntil - now };
    }
    if (!count) {
      count = { failures: 0, lastFailureAt: now, lockedUntil: null };
      this.counts.set(account, count);
    }
    if (count.failures >= policy.maxAttempts) {
      // The limit was lowered on the configuration screen
      count.lockedUntil = now + policy.durationMs;
      return { locked: true, retryAfterMs: policy.durationMs };
    }

    count.failures += 1;
    count.lastFailureAt = now;
    if (count.failures >= policy.maxAttempts) {
      count.lockedUntil = now + policy.durationMs;
    }
    return { locked: false, attempt: this.attempt(account, count, policy) };
  }

  private attempt(
    account: string,
    count: FailureCount,
    policy: AccountLockoutPolicy,
  ): SignInAttempt {
    let settled = false;
    const settle = () => {
      const first = !settled;
      settled = true;
      return first;
    };
    return {
      succeeded: () => {
        if (settle() && this.counts.get(account) === count) {
          this.counts.delete(account);
        }
      },
      failed: () => {
        if (!settle() || count.failures < policy.maxAttempts) return null;
        return {
          attempts: count.failures,
          durationMinutes: policy.durationMinutes,
        };
      },
      abandoned: () => {
        if (!settle()) return;
        count.failures = Math.max(0, count.failures - 1);
        if (count.failures < policy.maxAttempts) count.lockedUntil = null;
        if (count.failures === 0 && this.counts.get(account) === count) {
          this.counts.delete(account);
        }
      },
    };
  }

  /** Unlocked after the lock, forgotten when no failure for a duration. */
  private isStale(count: FailureCount, now: number, durationMs: number) {
    return count.lockedUntil
      ? now >= count.lockedUntil
      : now - count.lastFailureAt >= durationMs;
  }

  private sweep(now: number, durationMs: number) {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [account, count] of this.counts) {
      if (this.isStale(count, now, durationMs)) this.counts.delete(account);
    }
  }
}
