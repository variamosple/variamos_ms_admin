import { mock } from "vitest-mock-extended";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ISecretCipher } from "#src/Domain/Core/Secret/ISecretCipher.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { hashRecoveryCode } from "#src/Domain/Mfa/Entity/RecoveryCodes.js";
import {
  base32Decode,
  TOTP_PERIOD_SECONDS,
  totpCode,
  totpStep,
} from "#src/Domain/Mfa/Entity/Totp.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import { UserMfaUseCase } from "./UserMfaUseCase.js";

/** Behaves as the SQL repository does, in memory. */
class InMemoryUserMfaRepository implements IUserMfaRepository {
  public readonly factors = new Map<string, UserMfaRecord>();
  public readonly codes = new Map<string, { hash: string; used: boolean }[]>();

  public async findByUser(userId: string) {
    const record = this.factors.get(userId);
    return record ? { ...record } : null;
  }
  public async savePending(userId: string, secretEncrypted: string) {
    if (this.factors.get(userId)?.enabledAt) return false;
    this.factors.set(userId, {
      userId,
      secretEncrypted,
      enabledAt: null,
      lastUsedStep: null,
    });
    return true;
  }
  public async enable(userId: string, step: number, codeHashes: string[]) {
    const record = this.factors.get(userId);
    if (!record || record.enabledAt) return false;
    record.enabledAt = new Date();
    record.lastUsedStep = step;
    this.codes.set(
      userId,
      codeHashes.map((hash) => ({ hash, used: false })),
    );
    return true;
  }
  public async recordStep(userId: string, step: number) {
    const record = this.factors.get(userId);
    if (!record || (record.lastUsedStep ?? -1) >= step) return false;
    record.lastUsedStep = step;
    return true;
  }
  public async useRecoveryCode(userId: string, codeHash: string) {
    const code = this.codes
      .get(userId)
      ?.find((c) => c.hash === codeHash && !c.used);
    if (!code) return false;
    code.used = true;
    return true;
  }
  public async countUnusedRecoveryCodes(userId: string) {
    return (this.codes.get(userId) ?? []).filter((c) => !c.used).length;
  }
  public async remove(userId: string) {
    this.factors.delete(userId);
    this.codes.delete(userId);
  }
}

/** Bound to the user like the real cipher, without the cryptography. */
const fakeCipher = (available = true): ISecretCipher => ({
  isAvailable: () => available,
  encrypt: (plain, context) => `v1:${context}:${plain.toString("hex")}`,
  decrypt: (stored, context) => {
    const [, owner, hex] = stored.split(":");
    if (owner !== context) throw new Error("Bound to another account.");
    return Buffer.from(hex ?? "", "hex");
  },
});

const PASSWORD = "Right-pass-1";
const USER = "user-1";

describe("UserMfaUseCase", () => {
  let now: number;
  let repository: InMemoryUserMfaRepository;
  let useCase: UserMfaUseCase;
  const userRepository = {
    verifyPassword: async (_userId: string, password: string) =>
      password === PASSWORD,
  };

  beforeEach(() => {
    now = 1_800_000_000_000;
    repository = new InMemoryUserMfaRepository();
    useCase = new UserMfaUseCase(
      repository,
      userRepository,
      fakeCipher(),
      mock<ILogger>(),
      () => now,
    );
  });

  const nextStep = () => {
    now += TOTP_PERIOD_SECONDS * 1000;
  };

  /** Enrolls the user; returns the secret and the recovery codes. */
  const enroll = async () => {
    const started = await useCase.startEnrollment(
      "t",
      USER,
      "ana@example.com",
      PASSWORD,
    );
    const secret = base32Decode(started.data?.secret ?? "");
    const confirmed = await useCase.confirmEnrollment(
      "t",
      USER,
      totpCode(secret, totpStep(now)),
    );
    return { secret, recoveryCodes: confirmed.data?.recoveryCodes ?? [] };
  };

  it("reports a user without second factor", async () => {
    expect((await useCase.status("t", USER)).data).toEqual({
      available: true,
      enabled: false,
      recoveryCodesRemaining: 0,
    });
  });

  it("turns the factor on with the first right code", async () => {
    const started = await useCase.startEnrollment(
      "t",
      USER,
      "ana@example.com",
      PASSWORD,
    );
    expect(started.errorCode).toBeUndefined();
    expect(started.data?.otpauthUri).toMatch(
      /^otpauth:\/\/totp\/VariaMos:ana%40example\.com\?secret=[A-Z2-7]{32}&issuer=VariaMos/,
    );
    expect((await useCase.status("t", USER)).data?.enabled).toBe(false);

    const secret = base32Decode(started.data?.secret ?? "");
    const confirmed = await useCase.confirmEnrollment(
      "t",
      USER,
      totpCode(secret, totpStep(now)),
    );

    expect(confirmed.data?.recoveryCodes).toHaveLength(10);
    expect((await useCase.status("t", USER)).data).toEqual({
      available: true,
      enabled: true,
      recoveryCodesRemaining: 10,
    });
  });

  it("stores the secret through the cipher and the recovery codes hashed", async () => {
    const { secret, recoveryCodes } = await enroll();
    const record = repository.factors.get(USER);

    expect(record?.secretEncrypted).toMatch(/^v1:/);
    expect(record?.secretEncrypted).not.toContain(secret.toString("base64"));
    expect(record?.secretEncrypted).toBe(
      `v1:${USER}:${secret.toString("hex")}`,
    );
    expect(repository.codes.get(USER)?.map((c) => c.hash)).toEqual(
      recoveryCodes.map(hashRecoveryCode),
    );
  });

  it("refuses to start with a wrong password", async () => {
    const started = await useCase.startEnrollment(
      "t",
      USER,
      "ana@example.com",
      "wrong",
    );

    expect(started.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(repository.factors.size).toBe(0);
  });

  it("refuses a wrong first code and keeps the enrollment pending", async () => {
    await useCase.startEnrollment("t", USER, "ana@example.com", PASSWORD);

    const confirmed = await useCase.confirmEnrollment("t", USER, "000000");

    expect(confirmed.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(confirmed.message).toBe("The code is incorrect.");
    expect((await useCase.status("t", USER)).data?.enabled).toBe(false);
  });

  it("refuses to confirm without an enrollment in progress", async () => {
    expect(
      (await useCase.confirmEnrollment("t", USER, "123456")).errorCode,
    ).toBe(DomainErrorCodes.INVALID_INPUT);
  });

  it("refuses a second enrollment while the factor is on", async () => {
    await enroll();

    const again = await useCase.startEnrollment(
      "t",
      USER,
      "ana@example.com",
      PASSWORD,
    );

    expect(again.errorCode).toBe(DomainErrorCodes.DUPLICATE_ENTITY);
  });

  it("turns the factor off with the password and a new code", async () => {
    const { secret } = await enroll();
    nextStep();

    const disabled = await useCase.disable(
      "t",
      USER,
      PASSWORD,
      totpCode(secret, totpStep(now)),
    );

    expect(disabled.errorCode).toBeUndefined();
    expect((await useCase.status("t", USER)).data?.enabled).toBe(false);
    expect(repository.codes.has(USER)).toBe(false);
  });

  it("refuses the code already used to turn the factor on", async () => {
    const { secret } = await enroll();

    const disabled = await useCase.disable(
      "t",
      USER,
      PASSWORD,
      totpCode(secret, totpStep(now)),
    );

    expect(disabled.message).toBe("The code is incorrect.");
    expect((await useCase.status("t", USER)).data?.enabled).toBe(true);
  });

  it("accepts a recovery code once", async () => {
    const { secret, recoveryCodes } = await enroll();
    const code = recoveryCodes[0] as string;

    expect(
      await useCase.verifySecondFactor(
        repository.factors.get(USER) as UserMfaRecord,
        code.toUpperCase(),
      ),
    ).toBe(true);
    expect(
      await useCase.verifySecondFactor(
        repository.factors.get(USER) as UserMfaRecord,
        code,
      ),
    ).toBe(false);
    expect((await useCase.status("t", USER)).data?.recoveryCodesRemaining).toBe(
      9,
    );
    expect(secret).toBeDefined();
  });

  it("turns the factor off with a recovery code", async () => {
    const { recoveryCodes } = await enroll();

    const disabled = await useCase.disable(
      "t",
      USER,
      PASSWORD,
      recoveryCodes[3] as string,
    );

    expect(disabled.errorCode).toBeUndefined();
  });

  it("refuses to turn the factor off with a wrong password or code", async () => {
    const { secret } = await enroll();
    nextStep();

    expect(
      (
        await useCase.disable(
          "t",
          USER,
          "wrong",
          totpCode(secret, totpStep(now)),
        )
      ).message,
    ).toBe("The password is incorrect.");
    expect((await useCase.disable("t", USER, PASSWORD, "000000")).message).toBe(
      "The code is incorrect.",
    );
    expect((await useCase.status("t", USER)).data?.enabled).toBe(true);
  });

  it("does not decrypt a secret copied to another account", async () => {
    await enroll();
    const record = repository.factors.get(USER) as UserMfaRecord;
    repository.factors.set("user-2", { ...record, userId: "user-2" });

    await expect(
      useCase.verifySecondFactor(
        repository.factors.get("user-2") as UserMfaRecord,
        "123456",
      ),
    ).rejects.toThrow();
  });

  it("is unavailable without an encryption key", async () => {
    const withoutKey = new UserMfaUseCase(
      repository,
      userRepository,
      fakeCipher(false),
      mock<ILogger>(),
    );

    expect((await withoutKey.status("t", USER)).data?.available).toBe(false);
    expect(
      (await withoutKey.startEnrollment("t", USER, "a@b.c", PASSWORD))
        .errorCode,
    ).toBe(DomainErrorCodes.UNAVAILABLE);
    expect(repository.factors.size).toBe(0);
  });

  it("answers a system error without details when storage fails", async () => {
    vi.spyOn(repository, "findByUser").mockRejectedValue(
      new Error("connection lost"),
    );

    const status = await useCase.status("t", USER);

    expect(status.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(status.message).toBe("Internal server error");
  });
});
