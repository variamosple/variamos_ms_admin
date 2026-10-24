import logger from "jet-logger";
import { mock } from "vitest-mock-extended";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AccountLockoutPolicy } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";
import {
  AccountLockout,
  AccountLockoutPolicyService,
  type SignInAdmission,
} from "./AccountLockoutService.js";

const MINUTE_MS = 60 * 1000;

function repositoryWith(values: Record<string, unknown>) {
  const repository = mock<IConfigurationRepository>();
  repository.queryByKey.mockImplementation(async (request) => {
    const key = request.data as string;
    if (!(key in values)) {
      return new ResponseModel<Configuration>("q").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "missing",
      );
    }
    return new ResponseModel<Configuration>("q").withResponse(
      Configuration.builder()
        .setKey(new ConfigurationKey(key))
        .setValue(values[key] as never)
        .setType("number")
        .setCategory("security")
        .setTargetServices(["variamos_ms_admin"])
        .build(),
    );
  });
  return repository;
}

describe("AccountLockoutPolicyService", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads the security.lockout.* keys", async () => {
    const service = new AccountLockoutPolicyService(
      repositoryWith({
        "security.lockout.max_attempts": 5,
        "security.lockout.duration_minutes": 30,
      }),
    );

    expect(await service.getPolicy()).toMatchObject({
      maxAttempts: 5,
      durationMinutes: 30,
    });
  });

  it("takes the default for a missing key", async () => {
    const service = new AccountLockoutPolicyService(
      repositoryWith({ "security.lockout.max_attempts": 5 }),
    );

    expect(await service.getPolicy()).toMatchObject({
      maxAttempts: 5,
      durationMinutes: 15,
    });
  });

  it("takes the default when the configuration cannot be read", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockRejectedValue(new Error("connection lost"));

    expect(
      await new AccountLockoutPolicyService(repository).getPolicy(),
    ).toMatchObject({ maxAttempts: 10, durationMinutes: 15 });
  });
});

describe("AccountLockout", () => {
  let now: number;
  let policy: AccountLockoutPolicy;
  let lockout: AccountLockout;

  beforeEach(() => {
    now = 1_000_000;
    policy = AccountLockoutPolicy.fromConfiguration({
      maxAttempts: 3,
      durationMinutes: 15,
    });
    lockout = new AccountLockout({ getPolicy: async () => policy }, () => now);
  });

  const admitted = (admission: SignInAdmission) => {
    if (admission.locked) throw new Error("unexpectedly locked");
    return admission.attempt;
  };

  const fail = async (account = "ana@example.com") =>
    admitted(await lockout.admit(account)).failed();

  it("locks the account at the last allowed failure", async () => {
    expect(await fail()).toBeNull();
    expect(await fail()).toBeNull();
    expect(await fail()).toEqual({ attempts: 3, durationMinutes: 15 });

    expect(await lockout.admit("ana@example.com")).toEqual({
      locked: true,
      retryAfterMs: 15 * MINUTE_MS,
    });
    expect((await lockout.admit("bob@example.com")).locked).toBe(false);
  });

  it("unlocks the account once the duration is over", async () => {
    for (let i = 0; i < 3; i++) await fail();

    now += 15 * MINUTE_MS - 1;
    expect((await lockout.admit("ana@example.com")).locked).toBe(true);
    now += 1;
    expect(await fail()).toBeNull();
  });

  it("forgets failures after a duration without failure", async () => {
    await fail();
    await fail();

    now += 15 * MINUTE_MS;

    expect(await fail()).toBeNull();
    expect(await fail()).toBeNull();
  });

  it("clears the count after a success", async () => {
    await fail();
    await fail();
    admitted(await lockout.admit("ana@example.com")).succeeded();

    expect(await fail()).toBeNull();
    expect(await fail()).toBeNull();
  });

  it("counts attempts in flight, so that parallel requests stop at the limit", async () => {
    const inFlight = await Promise.all(
      [1, 2, 3, 4, 5].map(() => lockout.admit("ana@example.com")),
    );

    expect(inFlight.map((a) => a.locked)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("does not count an abandoned attempt", async () => {
    await fail();
    await fail();
    admitted(await lockout.admit("ana@example.com")).abandoned();

    expect(await fail()).toEqual({ attempts: 3, durationMinutes: 15 });
  });

  it("settles an attempt once: a double callback cannot erase failures", async () => {
    await fail();
    await fail();
    const attempt = admitted(await lockout.admit("ana@example.com"));
    attempt.abandoned();
    attempt.abandoned();

    expect(await fail()).toEqual({ attempts: 3, durationMinutes: 15 });
  });

  it("locks at once when the limit is lowered to the failures already made", async () => {
    policy = AccountLockoutPolicy.fromConfiguration({
      maxAttempts: 5,
      durationMinutes: 15,
    });
    for (let i = 0; i < 4; i++) await fail();

    policy = AccountLockoutPolicy.fromConfiguration({
      maxAttempts: 4,
      durationMinutes: 15,
    });

    expect((await lockout.admit("ana@example.com")).locked).toBe(true);
  });

  it("applies a lowered limit from the next attempt", async () => {
    policy = AccountLockoutPolicy.fromConfiguration({
      maxAttempts: 5,
      durationMinutes: 15,
    });
    for (let i = 0; i < 4; i++) await fail();

    policy = AccountLockoutPolicy.fromConfiguration({
      maxAttempts: 3,
      durationMinutes: 10,
    });

    expect(await lockout.admit("ana@example.com")).toEqual({
      locked: true,
      retryAfterMs: 10 * MINUTE_MS,
    });
    now += 10 * MINUTE_MS - 1;
    expect((await lockout.admit("ana@example.com")).locked).toBe(true);
  });
});
