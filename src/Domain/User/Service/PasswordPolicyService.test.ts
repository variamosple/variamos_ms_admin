import { type MockProxy, mock } from "vitest-mock-extended";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  checkNewPassword,
  PasswordPolicyService,
} from "./PasswordPolicyService.js";

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
        .setType(typeof values[key] === "boolean" ? "boolean" : "number")
        .setCategory("security")
        .setTargetServices(["all"])
        .build(),
    );
  });
  return repository;
}

describe("PasswordPolicyService", () => {
  let logger: MockProxy<ILogger>;

  beforeEach(() => {
    logger = mock<ILogger>();
  });

  it("reads the security.password.* keys", async () => {
    const service = new PasswordPolicyService(
      repositoryWith({
        "security.password.min_length": 12,
        "security.password.require_uppercase": true,
        "security.password.require_numbers": false,
        "security.password.require_special": true,
      }),
      logger,
    );

    expect((await service.getPolicy()).toJSON()).toMatchObject({
      minLength: 12,
      requireNumbers: false,
    });
  });

  it("reads them again at each use, so a change applies at once", async () => {
    const values: Record<string, unknown> = {
      "security.password.min_length": 10,
    };
    const service = new PasswordPolicyService(repositoryWith(values), logger);

    expect((await service.getPolicy()).minLength).toBe(10);
    values["security.password.min_length"] = 14;
    expect((await service.getPolicy()).minLength).toBe(14);
  });

  it("falls back to the default when keys are missing or unreadable", async () => {
    const failing = mock<IConfigurationRepository>();
    failing.queryByKey.mockRejectedValue(new Error("db down"));

    expect(
      (await new PasswordPolicyService(repositoryWith({}), logger).getPolicy())
        .minLength,
    ).toBe(8);
    expect(
      (await new PasswordPolicyService(failing, logger).getPolicy())
        .requireSpecial,
    ).toBe(true);
  });

  it("reads the reset link validity, ignoring invalid values", async () => {
    expect(
      await new PasswordPolicyService(
        repositoryWith({ "security.password.reset_expiry": 1_800_000 }),
        logger,
      ).getResetExpiryMs(),
    ).toBe(1_800_000);
    expect(
      await new PasswordPolicyService(
        repositoryWith({ "security.password.reset_expiry": -1 }),
        logger,
      ).getResetExpiryMs(),
    ).toBeNull();
  });

  it("checkNewPassword returns the rule and logs the refusal without the password", async () => {
    const service = new PasswordPolicyService(
      repositoryWith({ "security.password.min_length": 12 }),
      logger,
    );

    await expect(
      checkNewPassword(service, logger, "Short1!x", "Sign-up"),
    ).resolves.toContain("between 12 and 64");
    expect(logger.info).toHaveBeenCalledWith(
      "[PASSWORD POLICY] Sign-up refused: length",
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("Short1!x");
    await expect(
      checkNewPassword(service, logger, "LongEnough12!", "Sign-up"),
    ).resolves.toBeNull();
  });
});
