import { randomBytes } from "node:crypto";
import {
  Configuration,
  ConfigurationKey,
  type ConfigurationValue,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { ConfigurationModel } from "./Configuration.js";
import { ConfigurationRepositoryImpl } from "./ConfigurationRepository.js";
import { SecretConfigurationValue } from "./SecretConfigurationValue.js";

const setting = (key: string, isSecret = false) =>
  new Configuration({
    key: new ConfigurationKey(key),
    value: "a value",
    type: "string",
    category: "general",
    requiresMfa: false,
    isSecret,
    environmentScope: "all",
    isReadOnly: false,
    targetServices: ["variamos_ms_admin"],
    updatedBy: "admin-1",
  });

// The row Sequelize gives back: the stored fields, with an id
const stored = (defaults: Record<string, unknown> | undefined) => ({
  id: 9,
  ...defaults,
});

/** A setting created from the screen (EV-18 lot C.3). */
describe("ConfigurationRepositoryImpl.createConfiguration", () => {
  const secrets = new SecretConfigurationValue(
    new AesGcmSecretCipher(randomBytes(32)),
  );
  const noKey = new SecretConfigurationValue(new AesGcmSecretCipher(null));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores a new key and gives it back", async () => {
    const write = vi
      .spyOn(ConfigurationModel, "findOrCreate")
      .mockImplementation(
        async (options) => [stored(options.defaults), true] as never,
      );

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).createConfiguration(new RequestModel("tx", setting("general.motd")));

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.id).toBe(9);
    expect(response.data?.value).toBe("a value");
    expect(write.mock.calls[0]?.[0].where).toEqual({ key: "general.motd" });
  });

  it("writes a new secret encrypted", async () => {
    const write = vi
      .spyOn(ConfigurationModel, "findOrCreate")
      .mockImplementation(
        async (options) => [stored(options.defaults), true] as never,
      );

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).createConfiguration(
      new RequestModel("tx", setting("notification.api.token", true)),
    );

    const value = write.mock.calls[0]?.[0].defaults?.value as
      | ConfigurationValue
      | undefined;
    expect(SecretConfigurationValue.isEncrypted(value)).toBe(true);
    expect(response.data?.value).toBe("a value");
  });

  it("refuses a secret without an encryption key", async () => {
    const write = vi.spyOn(ConfigurationModel, "findOrCreate");

    const response = await new ConfigurationRepositoryImpl(
      noKey,
    ).createConfiguration(
      new RequestModel("tx", setting("notification.api.token", true)),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.UNAVAILABLE);
    expect(write).not.toHaveBeenCalled();
  });

  it("never overwrites a key that exists", async () => {
    vi.spyOn(ConfigurationModel, "findOrCreate").mockResolvedValue([
      stored({ key: "general.motd" }),
      false,
    ] as never);

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).createConfiguration(new RequestModel("tx", setting("general.motd")));

    expect(response.errorCode).toBe(DomainErrorCodes.DUPLICATE_ENTITY);
    expect(response.message).toBe(
      "Configuration with key 'general.motd' already exists.",
    );
  });

  it("answers a system error when the database fails", async () => {
    vi.spyOn(ConfigurationModel, "findOrCreate").mockRejectedValue(
      new Error("connection lost"),
    );

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).createConfiguration(new RequestModel("tx", setting("general.motd")));

    expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
  });

  it("refuses a request without data", async () => {
    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).createConfiguration(new RequestModel<Configuration>("tx"));

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
  });
});
