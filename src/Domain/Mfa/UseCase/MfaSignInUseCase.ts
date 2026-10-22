import logger from "jet-logger";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IUserMfaRepository } from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import type { ISecretCipher } from "#src/Domain/Mfa/Service/ISecretCipher.js";
import type { PendingMfaSignIns } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import type {
  TrustedDeviceToken,
  TrustedDeviceUseCase,
} from "./TrustedDeviceUseCase.js";
import type { UserMfaUseCase } from "./UserMfaUseCase.js";

/** Wrong codes per account, whatever the number of password checks. */
export const MFA_SIGN_IN_FAILURES_PER_ACCOUNT = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
} as const;

/**
 * The code asked after the password at sign-in (SPC-2026-10-17-001,
 * lot 2). An account without second factor signs in as before.
 */
export class MfaSignInUseCase {
  private readonly failures = new Map<string, number[]>();

  public constructor(
    private readonly mfaRepository: IUserMfaRepository,
    private readonly mfaUseCase: Pick<UserMfaUseCase, "verifySecondFactor">,
    private readonly cipher: ISecretCipher,
    private readonly pending: PendingMfaSignIns,
    private readonly trustedDevices: Pick<
      TrustedDeviceUseCase,
      "days" | "isTrusted" | "trust"
    >,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Called once the password is right: a token to send with the code, or
   * null when no code is needed (no second factor, or a browser the user
   * trusted). A storage error is thrown, so that the sign-in fails rather
   * than skipping the code.
   */
  public async begin(
    userId: string,
    deviceToken?: string,
  ): Promise<string | null> {
    const record = await this.mfaRepository.findByUser(userId);
    if (!record?.enabledAt) return null;
    if (await this.trustedDevices.isTrusted(userId, deviceToken)) {
      logger.info(
        `[MFA] User ${userId} signed in without a code on a trusted browser`,
      );
      return null;
    }
    return this.pending.create(userId);
  }

  /** Days a browser may skip the code; 0 when the option is off. */
  public trustedDeviceDays(): Promise<number> {
    return this.trustedDevices.days();
  }

  /**
   * After a right code, when the user asked not to be asked again here.
   * Never throws: the sign-in itself has succeeded.
   */
  public async trustDevice(userId: string): Promise<TrustedDeviceToken | null> {
    try {
      const trusted = await this.trustedDevices.trust(userId);
      if (trusted) {
        logger.info(`[MFA] User ${userId} trusted a browser`);
      }
      return trusted;
    } catch (error) {
      logger.warn(
        `[MFA] Could not trust the browser of user ${userId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Checks the code of a pending sign-in; gives the user id when right. */
  public async complete(
    transactionId: string,
    token: string,
    code: string,
  ): Promise<ResponseModel<string>> {
    const response = new ResponseModel<string>(transactionId);
    const userId = token ? this.pending.find(token) : null;
    if (!userId) {
      return response.withError(
        DomainErrorCodes.UNAUTHORIZED_ACCESS,
        "Your sign-in has expired, please sign in again.",
      );
    }
    if (this.recentFailures(userId) >= MFA_SIGN_IN_FAILURES_PER_ACCOUNT.limit) {
      this.pending.remove(token);
      return response.withError(
        DomainErrorCodes.TOO_MANY_REQUESTS,
        "Too many attempts. Please try again later.",
      );
    }
    if (!this.cipher.isAvailable()) {
      return response.withError(
        DomainErrorCodes.UNAVAILABLE,
        "Two-factor authentication is not available yet.",
      );
    }
    // Counted before the first await: parallel requests see each other
    if (!this.pending.claim(token)) {
      return response.withError(
        DomainErrorCodes.TOO_MANY_REQUESTS,
        "A code is already being checked. Please try again.",
      );
    }
    this.recordFailure(userId);
    try {
      const record = await this.mfaRepository.findByUser(userId);
      if (!record?.enabledAt) {
        // Turned off since the password check: start again
        this.pending.remove(token);
        this.failures.delete(userId);
        return response.withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          "Your sign-in has expired, please sign in again.",
        );
      }
      if (!(await this.mfaUseCase.verifySecondFactor(record, code))) {
        this.pending.release(token);
        this.warnWhenBlocked(userId);
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "The code is incorrect.",
        );
      }
      this.pending.remove(token);
      this.failures.delete(userId);
      return response.withResponse(userId);
    } catch (error) {
      this.pending.release(token);
      logger.err(`[MFA] Sign-in check failed: ${(error as Error).message}`);
      return response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }
  }

  private recentFailures(userId: string): number {
    const since = this.now() - MFA_SIGN_IN_FAILURES_PER_ACCOUNT.windowMs;
    const recent = (this.failures.get(userId) ?? []).filter((t) => t > since);
    if (recent.length === 0) {
      this.failures.delete(userId);
    } else {
      this.failures.set(userId, recent);
    }
    return recent.length;
  }

  /** Counted as a failure until the code proves right. */
  private recordFailure(userId: string): void {
    this.failures.set(userId, [
      ...(this.failures.get(userId) ?? []),
      this.now(),
    ]);
  }

  private warnWhenBlocked(userId: string): void {
    const count = this.failures.get(userId)?.length ?? 0;
    if (count === MFA_SIGN_IN_FAILURES_PER_ACCOUNT.limit) {
      logger.warn(
        `[MFA] User ${userId} blocked for 15 min after ${count} wrong sign-in codes`,
      );
    }
  }
}
