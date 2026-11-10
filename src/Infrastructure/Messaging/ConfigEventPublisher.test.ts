import logger from "#src/common/logger.js";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { ConfigEventPublisherImpl } from "./ConfigEventPublisher.js";

vi.mock("#src/common/logger.js");

const configurationOf = (key: string, value: string, isSecret: boolean) =>
  Configuration.builder()
    .setKey(new ConfigurationKey(key))
    .setValue(value)
    .setType("string")
    .setCategory("env")
    .setIsSecret(isSecret)
    .setTargetServices(["all"])
    .build();

const loggedText = () =>
  vi
    .mocked(logger.info)
    .mock.calls.map((call) => String(call[0]))
    .join("\n");

describe("ConfigEventPublisherImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never writes a secret value in the logs, only its mask", async () => {
    // The repository hands the use case the secret decrypted, after an update
    const secret = configurationOf(
      "integrations.github.token",
      "ghp_secret-in-clear",
      true,
    );

    await new ConfigEventPublisherImpl().publishConfigUpdated(secret);

    expect(loggedText()).toContain("integrations.github.token");
    expect(loggedText()).not.toContain("ghp_secret-in-clear");
    expect(loggedText()).toContain(JSON.stringify(secret.getDisplayValue()));
  });

  it("writes the value of a plain configuration", async () => {
    await new ConfigEventPublisherImpl().publishConfigUpdated(
      configurationOf("general.site_name", "VariaMos", false),
    );

    expect(loggedText()).toContain('"VariaMos"');
  });

  it("still hands listeners the real value", async () => {
    const publisher = new ConfigEventPublisherImpl();
    const listener = vi.fn();
    publisher.addListener(listener);
    const secret = configurationOf("integrations.github.token", "ghp_x", true);

    await publisher.publishConfigUpdated(secret);

    expect(listener).toHaveBeenCalledWith(secret);
    expect(listener.mock.calls[0][0].value).toBe("ghp_x");
  });
});
