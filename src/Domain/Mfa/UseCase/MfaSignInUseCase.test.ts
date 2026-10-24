import type { Mock } from "vitest";
import { mock } from "vitest-mock-extended";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ISecretCipher } from "#src/Domain/Core/Secret/ISecretCipher.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import {
  MFA_SIGN_IN_MAX_ATTEMPTS,
  PendingMfaSignIns,
} from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import {
  MFA_SIGN_IN_FAILURES_PER_ACCOUNT,
  MfaSignInUseCase,
} from "./MfaSignInUseCase.js";
import type { TrustedDeviceToken } from "./TrustedDeviceUseCase.js";

const ENABLED: UserMfaRecord = {
  userId: "user-1",
  secretEncrypted: "v1:x",
  enabledAt: new Date(),
  lastUsedStep: null,
};
const RIGHT_CODE = "123456";

describe("MfaSignInUseCase", () => {
  let now: number;
  let repository: ReturnType<typeof mock<IUserMfaRepository>>;
  let verify: Mock<(record: UserMfaRecord, code: string) => Promise<boolean>>;
  let available: boolean;
  let useCase: MfaSignInUseCase;
  let trustedDevices: {
    days: Mock<() => Promise<number>>;
    isTrusted: Mock<(userId: string, token?: string) => Promise<boolean>>;
    trust: Mock<(userId: string) => Promise<TrustedDeviceToken | null>>;
  };

  beforeEach(() => {
    now = 1_000_000;
    available = true;
    repository = mock<IUserMfaRepository>();
    repository.findByUser.mockImplementation(async (userId) =>
      userId === "user-1" ? { ...ENABLED } : null,
    );
    verify = vi.fn(async (_record: UserMfaRecord, code: string) => {
      await Promise.resolve();
      return code === RIGHT_CODE;
    });
    const cipher = mock<ISecretCipher>();
    cipher.isAvailable.mockImplementation(() => available);
    trustedDevices = {
      days: vi.fn(async () => 14),
      isTrusted: vi.fn(async () => false),
      trust: vi.fn(async () => ({ token: "t", maxAgeMs: 1000 })),
    };
    useCase = new MfaSignInUseCase(
      repository,
      { verifySecondFactor: verify },
      cipher,
      new PendingMfaSignIns(() => now),
      trustedDevices,
      () => now,
    );
  });

  it("lets an account without second factor sign in as before", async () => {
    expect(await useCase.begin("user-2")).toBeNull();
  });

  it("skips the code on a browser the user trusted", async () => {
    trustedDevices.isTrusted.mockResolvedValue(true);

    expect(await useCase.begin("user-1", "device-token")).toBeNull();
    expect(trustedDevices.isTrusted).toHaveBeenCalledWith(
      "user-1",
      "device-token",
    );
  });

  it("does not look for a trusted browser without second factor", async () => {
    await useCase.begin("user-2", "device-token");

    expect(trustedDevices.isTrusted).not.toHaveBeenCalled();
  });

  it("trusts a browser on request, never failing the sign-in", async () => {
    expect(await useCase.trustDevice("user-1")).toEqual({
      token: "t",
      maxAgeMs: 1000,
    });

    trustedDevices.trust.mockRejectedValue(new Error("connection lost"));
    expect(await useCase.trustDevice("user-1")).toBeNull();
    expect(await useCase.trustedDeviceDays()).toBe(14);
  });

  it("asks the code of an account with a second factor", async () => {
    const token = await useCase.begin("user-1");

    const done = await useCase.complete("t", token as string, RIGHT_CODE);

    expect(done.errorCode).toBeUndefined();
    expect(done.data).toBe("user-1");
  });

  it("does not skip the code when the factor cannot be read", async () => {
    repository.findByUser.mockRejectedValue(new Error("connection lost"));

    await expect(useCase.begin("user-1")).rejects.toThrow();
  });

  it("refuses a wrong code, then accepts the right one", async () => {
    const token = (await useCase.begin("user-1")) as string;

    const wrong = await useCase.complete("t", token, "000000");
    const right = await useCase.complete("t", token, RIGHT_CODE);

    expect(wrong.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(right.data).toBe("user-1");
  });

  it("uses a token once", async () => {
    const token = (await useCase.begin("user-1")) as string;
    await useCase.complete("t", token, RIGHT_CODE);

    const again = await useCase.complete("t", token, RIGHT_CODE);

    expect(again.errorCode).toBe(DomainErrorCodes.UNAUTHORIZED_ACCESS);
  });

  it.each(["", "unknown-token"])("refuses the token %j", async (token) => {
    expect((await useCase.complete("t", token, RIGHT_CODE)).errorCode).toBe(
      DomainErrorCodes.UNAUTHORIZED_ACCESS,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("ends the token after the last allowed wrong code", async () => {
    const token = (await useCase.begin("user-1")) as string;
    for (let i = 0; i < MFA_SIGN_IN_MAX_ATTEMPTS; i++) {
      await useCase.complete("t", token, "000000");
    }

    expect((await useCase.complete("t", token, RIGHT_CODE)).errorCode).toBe(
      DomainErrorCodes.UNAUTHORIZED_ACCESS,
    );
  });

  it("blocks the account after five wrong codes, whatever the token", async () => {
    for (let i = 0; i < MFA_SIGN_IN_FAILURES_PER_ACCOUNT.limit; i++) {
      const token = (await useCase.begin("user-1")) as string;
      await useCase.complete("t", token, "000000");
    }
    const token = (await useCase.begin("user-1")) as string;

    const blocked = await useCase.complete("t", token, RIGHT_CODE);
    now += MFA_SIGN_IN_FAILURES_PER_ACCOUNT.windowMs;
    const later = await useCase.complete(
      "t",
      (await useCase.begin("user-1")) as string,
      RIGHT_CODE,
    );

    expect(blocked.errorCode).toBe(DomainErrorCodes.TOO_MANY_REQUESTS);
    expect(later.data).toBe("user-1");
  });

  it("does not count right codes: frequent sign-ins never block", async () => {
    for (let i = 0; i <= MFA_SIGN_IN_FAILURES_PER_ACCOUNT.limit; i++) {
      const token = (await useCase.begin("user-1")) as string;
      expect((await useCase.complete("t", token, RIGHT_CODE)).data).toBe(
        "user-1",
      );
    }
  });

  it("checks a single code at a time for parallel requests", async () => {
    const token = (await useCase.begin("user-1")) as string;

    const results = await Promise.all(
      ["000001", "000002", RIGHT_CODE, "000003"].map((code) =>
        useCase.complete("t", token, code),
      ),
    );

    expect(verify).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.errorCode)).toEqual([
      DomainErrorCodes.INVALID_INPUT,
      DomainErrorCodes.TOO_MANY_REQUESTS,
      DomainErrorCodes.TOO_MANY_REQUESTS,
      DomainErrorCodes.TOO_MANY_REQUESTS,
    ]);
  });

  it("counts parallel attempts on several tokens of one account", async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 8; i++) {
      tokens.push((await useCase.begin("user-1")) as string);
    }

    await Promise.all(tokens.map((t) => useCase.complete("t", t, "000000")));

    expect(verify).toHaveBeenCalledTimes(
      MFA_SIGN_IN_FAILURES_PER_ACCOUNT.limit,
    );
  });

  it("starts again when the factor was turned off meanwhile", async () => {
    const token = (await useCase.begin("user-1")) as string;
    repository.findByUser.mockResolvedValue({ ...ENABLED, enabledAt: null });

    expect((await useCase.complete("t", token, RIGHT_CODE)).errorCode).toBe(
      DomainErrorCodes.UNAUTHORIZED_ACCESS,
    );
  });

  it("refuses with 503 rather than skipping the code without key", async () => {
    const token = (await useCase.begin("user-1")) as string;
    available = false;

    expect((await useCase.complete("t", token, RIGHT_CODE)).errorCode).toBe(
      DomainErrorCodes.UNAVAILABLE,
    );
  });

  it("answers a system error when the check fails", async () => {
    const token = (await useCase.begin("user-1")) as string;
    verify.mockRejectedValueOnce(new Error("decrypt failed"));

    const failed = await useCase.complete("t", token, RIGHT_CODE);

    expect(failed.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(failed.message).toBe("Internal server error");
    expect((await useCase.complete("t", token, RIGHT_CODE)).data).toBe(
      "user-1",
    );
  });
});
