import { createHash } from "node:crypto";
import { mock } from "vitest-mock-extended";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { memorySessions } from "#src/Domain/Session/Repository/memorySessions.testing.js";
import { SESSION_POLICY_KEYS, SessionRegistry } from "./SessionRegistry.js";

const MINUTE = 60_000;
const START = Date.parse("2026-11-17T08:00:00Z");

function configurationWith(values: Record<string, unknown>) {
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

function setup(values: Record<string, unknown> = {}) {
  const clock = { now: START };
  const { rows, repository } = memorySessions(clock);
  for (const method of ["find", "touch"] as const) vi.spyOn(repository, method);
  const configuration = configurationWith(values);
  const logger = mock<ILogger>();
  const registry = new SessionRegistry(
    repository,
    configuration,
    logger,
    () => clock.now,
  );
  const later = (ms: number) => {
    clock.now += ms;
  };
  return { clock, rows, repository, configuration, logger, registry, later };
}

describe("SessionRegistry", () => {
  it("opens a session known by the hash of its identifier only", async () => {
    const { registry, rows } = setup();

    const id = await registry.open("u-1");

    expect(id).toMatch(/^[\w-]{43}$/);
    const idHash = createHash("sha256").update(id).digest("hex");
    expect([...rows.keys()]).toEqual([idHash]);
    expect(JSON.stringify([...rows])).not.toContain(id);
    expect(await registry.open("u-1")).not.toBe(id);
  });

  it("accepts an open session of its account, and no other", async () => {
    const { registry, later } = setup();
    const id = await registry.open("u-1");
    later(MINUTE);

    expect(await registry.check(id, "u-1", START)).toBeNull();
    expect(await registry.check(id, "u-2", START)).toBe("unknown");
    expect(await registry.check("forged", "u-1", START)).toBe("unknown");
  });

  it("accepts a token without a session only when issued before the registry", async () => {
    const { registry } = setup();

    expect(await registry.check(undefined, "u-1", START - 1)).toBeNull();
    expect(await registry.check(undefined, "u-1", START)).toBe("unknown");
  });

  it("ends a session idle for more than an hour, by default", async () => {
    const { registry, later } = setup();
    const id = await registry.open("u-1");

    later(60 * MINUTE);
    expect(await registry.check(id, "u-1", START)).toBeNull();
    later(60 * MINUTE + 1);
    expect(await registry.check(id, "u-1", START)).toBe("idle");
  });

  it("keeps an active session up to 12 hours, by default", async () => {
    const { registry, later } = setup();
    const id = await registry.open("u-1");

    for (let minutes = 0; minutes < 12 * 60; minutes += 30) {
      later(30 * MINUTE);
      expect(await registry.check(id, "u-1", START)).toBeNull();
    }
    later(1);
    expect(await registry.check(id, "u-1", START)).toBe("too_old");
  });

  it("writes the last activity at most once a minute", async () => {
    const { registry, repository, later } = setup();
    const id = await registry.open("u-1");

    later(10_000);
    await registry.check(id, "u-1", START);
    later(10_000);
    await registry.check(id, "u-1", START);
    expect(repository.touch).not.toHaveBeenCalled();

    later(40_000);
    await registry.check(id, "u-1", START);
    later(1_000);
    await registry.check(id, "u-1", START);
    expect(repository.touch).toHaveBeenCalledTimes(1);
  });

  it("reads a session again after a few seconds only", async () => {
    const { registry, repository, later } = setup();
    const id = await registry.open("u-1");

    await registry.check(id, "u-1", START);
    later(4_000);
    await registry.check(id, "u-1", START);
    expect(repository.find).toHaveBeenCalledTimes(1);
    later(1_000);
    await registry.check(id, "u-1", START);
    expect(repository.find).toHaveBeenCalledTimes(2);
  });

  it("refuses a session at once after its revocation", async () => {
    const { registry } = setup();
    const id = await registry.open("u-1");
    expect(await registry.check(id, "u-1", START)).toBeNull();

    await registry.revoke(id);

    expect(await registry.check(id, "u-1", START)).toBe("revoked");
    await expect(registry.revoke(undefined)).resolves.toBeUndefined();
  });

  it("ends every session of an account at once, and those only", async () => {
    const { registry } = setup();
    const first = await registry.open("u-1");
    const second = await registry.open("u-1");
    const other = await registry.open("u-2");
    expect(await registry.check(first, "u-1", START)).toBeNull();

    expect(await registry.revokeAllOf("u-1")).toBe(2);

    expect(await registry.check(first, "u-1", START)).toBe("revoked");
    expect(await registry.check(second, "u-1", START)).toBe("revoked");
    expect(await registry.check(other, "u-2", START)).toBeNull();
  });

  it("forgets the sessions read when it holds too many", async () => {
    const { registry, repository } = setup();
    const id = await registry.open("u-1");
    await registry.check(id, "u-1", START);
    for (let n = 0; n < 1_000; n += 1) {
      await registry.check(`unknown-${n}`, "u-1", START);
    }

    await registry.check(id, "u-1", START);

    expect(repository.find).toHaveBeenCalledTimes(1_002);
  });

  it("takes the configured durations, read again after 30 seconds", async () => {
    const values: Record<string, unknown> = {
      [SESSION_POLICY_KEYS.idleMinutes]: 5,
      [SESSION_POLICY_KEYS.maxHours]: 1,
    };
    const { registry, configuration, later } = setup(values);
    const id = await registry.open("u-1");

    later(5 * MINUTE + 1);
    expect(await registry.check(id, "u-1", START)).toBe("idle");
    expect(configuration.queryByKey).toHaveBeenCalledTimes(2);

    values[SESSION_POLICY_KEYS.idleMinutes] = 30;
    expect(await registry.check(id, "u-1", START)).toBe("idle");
    later(30_000);
    expect(await registry.check(id, "u-1", START)).toBeNull();
    expect(configuration.queryByKey).toHaveBeenCalledTimes(4);
  });

  it("takes the default when a key cannot be read", async () => {
    const { registry, configuration, logger, later } = setup();
    configuration.queryByKey.mockRejectedValue(new Error("database down"));
    const id = await registry.open("u-1");

    later(59 * MINUTE);
    expect(await registry.check(id, "u-1", START)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("security.session.idle_minutes"),
    );
  });
});
