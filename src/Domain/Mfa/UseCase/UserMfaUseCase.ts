import logger from "jet-logger";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from "#src/Domain/Mfa/Entity/RecoveryCodes.js";
import {
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "#src/Domain/Mfa/Entity/Totp.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import type { ISecretCipher } from "#src/Domain/Mfa/Service/ISecretCipher.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";

export const MFA_ISSUER = "VariaMos";

export interface MfaStatus {
  /** False while no encryption key is configured. */
  available: boolean;
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export interface MfaEnrollment {
  otpauthUri: string;
  /** The same secret in base32, for apps that cannot scan a QR code. */
  secret: string;
}

export interface MfaRecoveryCodes {
  recoveryCodes: string[];
}

/**
 * Two-factor authentication of one's own account (SPC-2026-10-17-001,
 * EV-87 lot 5): TOTP (RFC 6238) and single-use recovery codes.
 */
export class UserMfaUseCase {
  public constructor(
    private readonly mfaRepository: IUserMfaRepository,
    private readonly userRepository: Pick<IUserRepository, "verifyPassword">,
    private readonly cipher: ISecretCipher,
    private readonly now: () => number = Date.now,
  ) {}

  public async status(
    transactionId: string,
    userId: string,
  ): Promise<ResponseModel<MfaStatus>> {
    const response = new ResponseModel<MfaStatus>(transactionId);
    try {
      const record = await this.mfaRepository.findByUser(userId);
      const enabled = !!record?.enabledAt;
      return response.withResponse({
        available: this.cipher.isAvailable(),
        enabled,
        recoveryCodesRemaining: enabled
          ? await this.mfaRepository.countUnusedRecoveryCodes(userId)
          : 0,
      });
    } catch (error) {
      return this.systemError(response, "status", error);
    }
  }

  /** Checks the password, then draws a secret, kept until the first code. */
  public async startEnrollment(
    transactionId: string,
    userId: string,
    email: string,
    password: string,
  ): Promise<ResponseModel<MfaEnrollment>> {
    const response = new ResponseModel<MfaEnrollment>(transactionId);
    if (!this.cipher.isAvailable()) {
      return this.unavailable(response);
    }
    try {
      if (!(await this.userRepository.verifyPassword(userId, password))) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "The password is incorrect.",
        );
      }
      const record = await this.mfaRepository.findByUser(userId);
      if (record?.enabledAt) {
        return response.withError(
          DomainErrorCodes.DUPLICATE_ENTITY,
          "Two-factor authentication is already on.",
        );
      }
      const secret = generateTotpSecret();
      const saved = await this.mfaRepository.savePending(
        userId,
        this.cipher.encrypt(secret, userId),
      );
      if (!saved) {
        return response.withError(
          DomainErrorCodes.DUPLICATE_ENTITY,
          "Two-factor authentication is already on.",
        );
      }
      return response.withResponse({
        otpauthUri: otpauthUri(MFA_ISSUER, email, secret),
        secret: base32Encode(secret),
      });
    } catch (error) {
      return this.systemError(response, "startEnrollment", error);
    }
  }

  /** A right first code turns the factor on and gives the recovery codes. */
  public async confirmEnrollment(
    transactionId: string,
    userId: string,
    code: string,
  ): Promise<ResponseModel<MfaRecoveryCodes>> {
    const response = new ResponseModel<MfaRecoveryCodes>(transactionId);
    if (!this.cipher.isAvailable()) {
      return this.unavailable(response);
    }
    try {
      const record = await this.mfaRepository.findByUser(userId);
      if (!record || record.enabledAt) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "No two-factor enrollment is in progress.",
        );
      }
      const step = verifyTotp(
        this.cipher.decrypt(record.secretEncrypted, userId),
        code,
        this.now(),
        null,
      );
      if (step === null) {
        return this.wrongCode(response);
      }
      const recoveryCodes = generateRecoveryCodes();
      const enabled = await this.mfaRepository.enable(
        userId,
        step,
        recoveryCodes.map(hashRecoveryCode),
      );
      if (!enabled) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "No two-factor enrollment is in progress.",
        );
      }
      logger.info(`[MFA] Two-factor authentication on for user ${userId}`);
      return response.withResponse({ recoveryCodes });
    } catch (error) {
      return this.systemError(response, "confirmEnrollment", error);
    }
  }

  /** Needs the password and a code from the app or a recovery code. */
  public async disable(
    transactionId: string,
    userId: string,
    password: string,
    code: string,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(transactionId);
    if (!this.cipher.isAvailable()) {
      return this.unavailable(response);
    }
    try {
      if (!(await this.userRepository.verifyPassword(userId, password))) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "The password is incorrect.",
        );
      }
      const record = await this.mfaRepository.findByUser(userId);
      if (!record?.enabledAt) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Two-factor authentication is not on.",
        );
      }
      if (!(await this.verifySecondFactor(record, code))) {
        return this.wrongCode(response);
      }
      await this.mfaRepository.remove(userId);
      logger.info(`[MFA] Two-factor authentication off for user ${userId}`);
      return response.withResponse(null);
    } catch (error) {
      return this.systemError(response, "disable", error);
    }
  }

  /**
   * A code from the app (each step once) or an unused recovery code, which
   * is then spent.
   */
  public async verifySecondFactor(
    record: UserMfaRecord,
    code: string,
  ): Promise<boolean> {
    const step = verifyTotp(
      this.cipher.decrypt(record.secretEncrypted, record.userId),
      code,
      this.now(),
      record.lastUsedStep,
    );
    if (step !== null) {
      return this.mfaRepository.recordStep(record.userId, step);
    }
    const usedRecoveryCode = await this.mfaRepository.useRecoveryCode(
      record.userId,
      hashRecoveryCode(code),
    );
    if (usedRecoveryCode) {
      logger.info(`[MFA] Recovery code used by user ${record.userId}`);
    }
    return usedRecoveryCode;
  }

  private wrongCode<T>(response: ResponseModel<T>): ResponseModel<T> {
    return response.withError(
      DomainErrorCodes.INVALID_INPUT,
      "The code is incorrect.",
    );
  }

  private unavailable<T>(response: ResponseModel<T>): ResponseModel<T> {
    return response.withError(
      DomainErrorCodes.UNAVAILABLE,
      "Two-factor authentication is not available yet.",
    );
  }

  private systemError<T>(
    response: ResponseModel<T>,
    operation: string,
    error: unknown,
  ): ResponseModel<T> {
    logger.err(`[MFA] ${operation} failed: ${(error as Error).message}`);
    return response.withError(
      DomainErrorCodes.SYSTEM_ERROR,
      "Internal server error",
    );
  }
}
