import { SecurityAlertPolicy } from "./SecurityAlertPolicy.js";

const MINUTE_MS = 60 * 1000;

describe("SecurityAlertPolicy", () => {
  it("takes the configured values within their bounds", () => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      failedSignInsMax: 5,
      failedSignInsWindowMinutes: 30,
      massOperationsMax: 50,
      massOperationsWindowMinutes: 5,
      cooldownMinutes: 120,
    });

    expect(policy.failedSignIns).toEqual({ max: 5, windowMs: 30 * MINUTE_MS });
    expect(policy.massOperations).toEqual({ max: 50, windowMs: 5 * MINUTE_MS });
    expect(policy.cooldownMs).toBe(120 * MINUTE_MS);
  });

  it.each([
    ["below its bound", 2],
    ["above its bound", 1001],
    ["not an integer", 7.5],
    ["not a number", "12"],
    ["missing", undefined],
  ])("takes the default for a value %s", (_case, value) => {
    const policy = SecurityAlertPolicy.fromConfiguration({
      failedSignInsMax: value,
      cooldownMinutes: value === undefined ? undefined : 2000,
    });

    expect(policy.failedSignIns.max).toBe(
      SecurityAlertPolicy.DEFAULT.failedSignIns.max,
    );
    expect(policy.cooldownMs).toBe(SecurityAlertPolicy.DEFAULT.cooldownMs);
  });

  it("mails the administrators about a new device by default", () => {
    expect(SecurityAlertPolicy.DEFAULT.newDeviceScope).toBe("administrators");
  });

  it("reads each scope of the new-device alert, the default otherwise", () => {
    for (const scope of ["off", "administrators", "everyone"]) {
      expect(
        SecurityAlertPolicy.fromConfiguration({ newDeviceScope: scope })
          .newDeviceScope,
      ).toBe(scope);
    }
    for (const scope of ["", "admins", "EVERYONE", 1, null]) {
      expect(
        SecurityAlertPolicy.fromConfiguration({ newDeviceScope: scope })
          .newDeviceScope,
      ).toBe("administrators");
    }
  });
});
