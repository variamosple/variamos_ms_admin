import { createHash, randomBytes } from "node:crypto";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { ITrustedDeviceRepository } from "#src/Domain/Mfa/Repository/ITrustedDeviceRepository.js";

export const TRUSTED_DEVICE_DAYS_KEY = "security.mfa.trusted_device_days";

/** Accepted values of the key; 0 always asks the code. */
export const TRUSTED_DEVICE_DAYS_BOUNDS = { min: 0, max: 90 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 random bytes in base64url, as `trust` makes them. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hashOf = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export interface TrustedDeviceToken {
  token: string;
  maxAgeMs: number;
}

/**
 * "Don't ask for a code on this device" (SPC-2026-10-17-001, lot 6). The
 * browser keeps a random token in a cookie; only its hash is stored. The
 * number of days is read at each use, so lowering it also shortens the
 * browsers already trusted. A key that cannot be read, or out of bounds,
 * counts as 0: the code is asked.
 */
export class TrustedDeviceUseCase {
  public constructor(
    private readonly repository: ITrustedDeviceRepository,
    private readonly configurationRepository: Pick<
      IConfigurationRepository,
      "queryByKey"
    >,
    private readonly logger: ILogger,
  ) {}

  public async days(): Promise<number> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>(
          "readTrustedDeviceDays",
          TRUSTED_DEVICE_DAYS_KEY,
        ),
      );
      const value: unknown = response.errorCode
        ? undefined
        : response.data?.value;
      const { min, max } = TRUSTED_DEVICE_DAYS_BOUNDS;
      return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= min &&
        value <= max
        ? value
        : 0;
    } catch (error) {
      this.logger.warn(
        `Could not read ${TRUSTED_DEVICE_DAYS_KEY}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /** A new token for this browser, or null when the option is off. */
  public async trust(userId: string): Promise<TrustedDeviceToken | null> {
    const days = await this.days();
    if (days === 0) return null;
    const token = randomBytes(32).toString("base64url");
    await this.repository.add(userId, hashOf(token), days);
    return { token, maxAgeMs: days * DAY_MS };
  }

  /** Never throws: on any doubt, the code is asked. */
  public async isTrusted(userId: string, token?: string): Promise<boolean> {
    if (!token || !TOKEN_PATTERN.test(token)) return false;
    try {
      const days = await this.days();
      return (
        days > 0 && (await this.repository.use(userId, hashOf(token), days))
      );
    } catch (error) {
      this.logger.warn(
        `[MFA] Trusted device check failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  public forgetAll(userId: string): Promise<number> {
    return this.repository.removeAll(userId);
  }
}
