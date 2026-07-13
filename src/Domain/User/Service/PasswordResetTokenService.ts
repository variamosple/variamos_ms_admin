import { IUserRepository } from "../IUserRepository";
import { User } from "../Entity/User";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import logger from "jet-logger";

export class PasswordResetTokenService {
  public constructor(private userRepository: IUserRepository) {}

  /**
   * Validates user state, generates a recovery token, hashes it, saves it to the DB, and returns the raw token.
   */
  public async createResetToken(
    user: User,
    expiryInMs: number,
    auditContext: string,
  ): Promise<string> {
    if (!user.isEnabled) {
      logger.warn(`[${auditContext}] Failed: User account is disabled (ID: ${user.id}).`);
      throw new Error("User account is disabled.");
    }

    if (user.isDeleted) {
      logger.warn(`[${auditContext}] Failed: User account is marked as deleted (ID: ${user.id}).`);
      throw new Error("User account is deleted.");
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + expiryInMs);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await this.userRepository.savePasswordResetToken(user.id || "", tokenHash, expiresAt);

    return token;
  }
}
