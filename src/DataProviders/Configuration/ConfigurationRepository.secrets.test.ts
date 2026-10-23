import { randomBytes } from "node:crypto";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { ConfigurationModel } from "./Configuration.js";
import { ConfigurationRepositoryImpl } from "./ConfigurationRepository.js";
import { SecretConfigurationValue } from "./SecretConfigurationValue.js";

const KEY = "notification.smtp.password";

// Plain stand-ins for Sequelize rows: only the fields the repository reads
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  key: KEY,
  value: "smtp-password",
  type: "string",
  category: "notification",
  requiresMfa: false,
  isSecret: true,
  environmentScope: "all",
  isReadOnly: false,
  targetServices: ["variamos_ms_notifications"],
  ...overrides,
});

const update = (value: string) =>
  new RequestModel("tx", { key: KEY, value, operatorId: "admin-1" });

/** Secret configurations are encrypted at rest (T-13, EV-78 lot 2). */
describe("ConfigurationRepositoryImpl and secret values", () => {
  const secrets = new SecretConfigurationValue(
    new AesGcmSecretCipher(randomBytes(32)),
  );
  const noKey = new SecretConfigurationValue(new AesGcmSecretCipher(null));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a secret encrypted", async () => {
    vi.spyOn(ConfigurationModel, "findOne").mockResolvedValue(row() as never);
    const write = vi
      .spyOn(ConfigurationModel, "update")
      .mockResolvedValue([1] as never);

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).updateConfiguration(update("new-password"));

    expect(response.errorCode).toBeUndefined();
    const stored = (write.mock.calls[0]?.[0] as { value: unknown } | undefined)
      ?.value;
    expect(SecretConfigurationValue.isEncrypted(stored)).toBe(true);
    expect(secrets.decrypt(KEY, stored)).toBe("new-password");
  });

  it("writes a plain configuration as it is", async () => {
    vi.spyOn(ConfigurationModel, "findOne").mockResolvedValue(
      row({ key: "general.app.name", isSecret: false }) as never,
    );
    const write = vi
      .spyOn(ConfigurationModel, "update")
      .mockResolvedValue([1] as never);

    await new ConfigurationRepositoryImpl(noKey).updateConfiguration(
      new RequestModel("tx", {
        key: "general.app.name",
        value: "VariaMos",
        operatorId: "admin-1",
      }),
    );

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ value: "VariaMos" }),
      expect.anything(),
    );
  });

  it("refuses to write a secret without an encryption key", async () => {
    vi.spyOn(ConfigurationModel, "findOne").mockResolvedValue(row() as never);
    const write = vi.spyOn(ConfigurationModel, "update");

    const response = await new ConfigurationRepositoryImpl(
      noKey,
    ).updateConfiguration(update("new-password"));

    expect(response.errorCode).toBe(DomainErrorCodes.UNAVAILABLE);
    expect(write).not.toHaveBeenCalled();
  });

  it("reads a secret back in clear, encrypted or not yet", async () => {
    vi.spyOn(ConfigurationModel, "findAll").mockResolvedValue([
      row({ value: secrets.encrypt(KEY, "smtp-password") }),
      row({ id: 2, key: "notification.smtp.user", value: "smtp-user" }),
    ] as never);

    const response = await new ConfigurationRepositoryImpl(
      secrets,
    ).queryConfigurations(new RequestModel("tx", {}));

    expect(response.data?.map((config) => config.value)).toEqual([
      "smtp-password",
      "smtp-user",
    ]);
    expect(response.data?.map((config) => config.getDisplayValue())).toEqual([
      "********",
      "********",
    ]);
  });

  it("loads a secret it cannot decrypt as the mask, without failing the list", async () => {
    vi.spyOn(ConfigurationModel, "findAll").mockResolvedValue([
      row({ value: secrets.encrypt(KEY, "smtp-password") }),
      row({
        id: 2,
        key: "notification.smtp.port",
        type: "number",
        value: secrets.encrypt("notification.smtp.port", 587),
      }),
      row({
        id: 3,
        key: "general.app.name",
        value: "VariaMos",
        isSecret: false,
      }),
    ] as never);

    const response = await new ConfigurationRepositoryImpl(
      noKey,
    ).queryConfigurations(new RequestModel("tx", {}));

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.map((config) => config.value)).toEqual([
      "********",
      "********",
      "VariaMos",
    ]);
  });
});
