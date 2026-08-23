import { Configuration, ConfigurationKey } from "./Configuration.js";

describe("Configuration Key Value Object", () => {
  it("should create a valid key", () => {
    const key = new ConfigurationKey("security.password.min_length");
    expect(key.getValue()).toBe("security.password.min_length");
  });

  it("should throw error for empty key", () => {
    expect(() => new ConfigurationKey("")).toThrow(
      "Configuration key cannot be empty.",
    );
  });

  it("should throw error for invalid format key", () => {
    expect(() => new ConfigurationKey("security")).toThrow(
      "Invalid configuration key format",
    );
    expect(() => new ConfigurationKey("security-password")).toThrow(
      "Invalid configuration key format",
    );
  });
});

describe("Configuration Entity Invariants", () => {
  const validKey = new ConfigurationKey("general.site_name");

  it("should build a valid configuration", () => {
    const config = Configuration.builder()
      .setKey(validKey)
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .build();

    expect(config.key.getValue()).toBe("general.site_name");
    expect(config.value).toBe("VariaMos");
    expect(config.type).toBe("string");
    expect(config.category).toBe("general");
    expect(config.targetServices).toEqual(["all"]);
  });

  it("should enforce type validation matching type property", () => {
    // Expected boolean, got string
    expect(() => {
      Configuration.builder()
        .setKey(validKey)
        .setValue("true")
        .setType("boolean")
        .setCategory("general")
        .setTargetServices(["all"])
        .build();
    }).toThrow("must be a boolean");

    // Expected number, got string
    expect(() => {
      Configuration.builder()
        .setKey(validKey)
        .setValue("12")
        .setType("number")
        .setCategory("general")
        .setTargetServices(["all"])
        .build();
    }).toThrow("must be a number");

    // Expected array, got string
    expect(() => {
      Configuration.builder()
        .setKey(validKey)
        .setValue("val")
        .setType("array")
        .setCategory("general")
        .setTargetServices(["all"])
        .build();
    }).toThrow("must be an array");
  });

  it("should prevent updating value if configuration is read-only", () => {
    const config = Configuration.builder()
      .setKey(validKey)
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .setIsReadOnly(true)
      .build();

    expect(() => config.updateValue("NewName", "admin")).toThrow(
      "is read-only",
    );
  });

  it("should allow updating value and set updatedBy metadata", () => {
    const config = Configuration.builder()
      .setKey(validKey)
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .build();

    config.updateValue("NewName", "admin123");
    expect(config.value).toBe("NewName");
    expect(config.updatedBy).toBe("admin123");
    expect(config.updatedAt).toBeDefined();
  });

  it("should mask values if it is a secret", () => {
    const secretConfig = Configuration.builder()
      .setKey(new ConfigurationKey("notification.smtp.password"))
      .setValue("secret-password")
      .setType("string")
      .setCategory("notification")
      .setTargetServices(["variamos_ms_notifications"])
      .setIsSecret(true)
      .build();

    expect(secretConfig.getDisplayValue()).toBe("********");

    const nonSecretConfig = Configuration.builder()
      .setKey(validKey)
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .setIsSecret(false)
      .build();

    expect(nonSecretConfig.getDisplayValue()).toBe("VariaMos");
  });
});
