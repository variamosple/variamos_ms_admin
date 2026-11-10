import crypto from "node:crypto";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { User } from "../Entity/User.js";
import type { IUserRepository } from "../IUserRepository.js";

export class PasswordResetTokenService {
  public constructor(
    private userRepository: IUserRepository,
    private readonly logger: ILogger,
  ) {}

  /**
   * Validates user state, generates a recovery token, hashes it, saves it to the DB, and returns the raw token.
   */
  public async createResetToken(
    user: User,
    expiryInMs: number,
    auditContext: string,
  ): Promise<string> {
    if (!user.isEnabled) {
      this.logger.warn(
        `[${auditContext}] Failed: User account is disabled (ID: ${user.id}).`,
      );
      throw new Error("User account is disabled.");
    }

    if (user.isDeleted) {
      this.logger.warn(
        `[${auditContext}] Failed: User account is marked as deleted (ID: ${user.id}).`,
      );
      throw new Error("User account is deleted.");
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiryInMs);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await this.userRepository.savePasswordResetToken(
      user.id || "",
      tokenHash,
      expiresAt,
    );

    return token;
  }
}
