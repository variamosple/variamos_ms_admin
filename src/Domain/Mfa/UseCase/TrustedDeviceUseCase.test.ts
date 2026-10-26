import { createHash } from "node:crypto";
import { mock } from "vitest-mock-extended";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { ITrustedDeviceRepository } from "#src/Domain/Mfa/Repository/ITrustedDeviceRepository.js";
import {
  TRUSTED_DEVICE_DAYS_KEY,
  TrustedDeviceUseCase,
} from "./TrustedDeviceUseCase.js";

const TOKEN = "a".repeat(43);
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("TrustedDeviceUseCase", () => {
  let repository: ReturnType<typeof mock<ITrustedDeviceRepository>>;
  let configuration: ReturnType<typeof mock<IConfigurationRepository>>;
  let logger: ReturnType<typeof mock<ILogger>>;
  let useCase: TrustedDeviceUseCase;

  const configured = (value: unknown) =>
    configuration.queryByKey.mockResolvedValue(
      new ResponseModel<never>("t").withResponse({ value } as never),
    );

  beforeEach(() => {
    repository = mock<ITrustedDeviceRepository>();
    repository.use.mockResolvedValue(true);
    configuration = mock<IConfigurationRepository>();
    configured(14);
    logger = mock<ILogger>();
    useCase = new TrustedDeviceUseCase(repository, configuration, logger);
  });

  it("reads the number of days from its key", async () => {
    expect(await useCase.days()).toBe(14);
    expect(configuration.queryByKey.mock.calls[0]?.[0].data).toBe(
      TRUSTED_DEVICE_DAYS_KEY,
    );
  });

  it.each([
    [0, 0],
    [90, 90],
    [91, 0],
    [-1, 0],
    [1.5, 0],
    ["14", 0],
    [null, 0],
  ])("takes %j as %j days", async (value, days) => {
    configured(value);

    expect(await useCase.days()).toBe(days);
  });

  it("asks the code when the key cannot be read", async () => {
    configuration.queryByKey.mockResolvedValueOnce(
      new ResponseModel<never>("t").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "missing",
      ),
    );
    expect(await useCase.days()).toBe(0);

    configuration.queryByKey.mockRejectedValueOnce(new Error("down"));
    expect(await useCase.days()).toBe(0);
  });

  it("gives a random token and stores only its hash", async () => {
    const first = await useCase.trust("user-1");
    const second = await useCase.trust("user-1");

    expect(first?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second?.token).not.toBe(first?.token);
    expect(first?.maxAgeMs).toBe(14 * 24 * 60 * 60 * 1000);
    expect(repository.add).toHaveBeenCalledWith(
      "user-1",
      sha256(first?.token as string),
      14,
    );
  });

  it("trusts nothing when the option is off", async () => {
    configured(0);

    expect(await useCase.trust("user-1")).toBeNull();
    expect(await useCase.isTrusted("user-1", TOKEN)).toBe(false);
    expect(repository.add).not.toHaveBeenCalled();
    expect(repository.use).not.toHaveBeenCalled();
  });

  it("checks the hash of the token, with the current number of days", async () => {
    configured(3);

    expect(await useCase.isTrusted("user-1", TOKEN)).toBe(true);
    expect(repository.use).toHaveBeenCalledWith("user-1", sha256(TOKEN), 3);
  });

  it.each([undefined, "", "short", `${TOKEN}=`, "é".repeat(43)])(
    "does not look up the token %j",
    async (token) => {
      expect(await useCase.isTrusted("user-1", token)).toBe(false);
      expect(repository.use).not.toHaveBeenCalled();
    },
  );

  it("asks the code when the check fails", async () => {
    repository.use.mockRejectedValue(new Error("connection lost"));

    expect(await useCase.isTrusted("user-1", TOKEN)).toBe(false);
  });

  it("forgets every browser of the user", async () => {
    repository.removeAll.mockResolvedValue(3);

    expect(await useCase.forgetAll("user-1")).toBe(3);
    expect(repository.removeAll).toHaveBeenCalledWith("user-1");
  });
});
