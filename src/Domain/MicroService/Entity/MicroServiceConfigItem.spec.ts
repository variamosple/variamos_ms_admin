import { MicroServiceConfigItem } from "./MicroServiceConfigItem.js";

const item = (isSecret: boolean, value = "smtp-password-value") =>
  new MicroServiceConfigItem(
    1,
    "variamos_ms_notifications",
    "notification.smtp.password",
    value,
    "string",
    isSecret,
    false,
    "SMTP password",
    "admin@example.com",
  );

describe("MicroServiceConfigItem", () => {
  it("never serializes a secret value", () => {
    const json = JSON.stringify({ data: [item(true)] });

    expect(json).not.toContain("smtp-password-value");
    expect(JSON.parse(json).data[0]).toMatchObject({
      key: "notification.smtp.password",
      value: "********",
      isSecret: true,
    });
  });

  it("serializes a non-secret value as is, with every field", () => {
    expect(JSON.parse(JSON.stringify(item(false, "587")))).toEqual({
      id: 1,
      serviceName: "variamos_ms_notifications",
      key: "notification.smtp.password",
      value: "587",
      type: "string",
      isSecret: false,
      isReadOnly: false,
      description: "SMTP password",
      updatedBy: "admin@example.com",
    });
  });

  it("keeps the real value for internal use", () => {
    expect(item(true).value).toBe("smtp-password-value");
    expect(item(true).getDisplayValue()).toBe("********");
  });
});
