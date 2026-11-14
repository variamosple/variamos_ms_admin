import {
  isAcceptedRecipientList,
  ServiceAlertPolicy,
} from "./ServiceAlertPolicy.js";

describe("ServiceAlertPolicy", () => {
  it("sends nothing and waits for 3 failed checks by default", () => {
    expect(ServiceAlertPolicy.DEFAULT.recipients).toEqual([]);
    expect(ServiceAlertPolicy.DEFAULT.failuresBeforeAlert).toBe(3);
    expect(ServiceAlertPolicy.fromConfiguration({})).toEqual(
      ServiceAlertPolicy.DEFAULT,
    );
  });

  it("reads a list separated by commas, semicolons or spaces, once each", () => {
    const policy = ServiceAlertPolicy.fromConfiguration({
      recipients: " ops@example.com, dev@example.org;ops@example.com  x@y.co ",
    });

    expect(policy.recipients).toEqual([
      "ops@example.com",
      "dev@example.org",
      "x@y.co",
    ]);
  });

  it("leaves out an address that is not one, and keeps 10 at most", () => {
    const many = Array.from({ length: 12 }, (_, i) => `a${i}@example.com`);

    expect(
      ServiceAlertPolicy.fromConfiguration({
        recipients: "not-an-address, ops@example.com",
      }).recipients,
    ).toEqual(["ops@example.com"]);
    expect(
      ServiceAlertPolicy.fromConfiguration({ recipients: many.join(",") })
        .recipients,
    ).toHaveLength(10);
    expect(
      ServiceAlertPolicy.fromConfiguration({ recipients: 42 }).recipients,
    ).toEqual([]);
  });

  it.each([
    [2, 2],
    [20, 20],
    [1, 3],
    [21, 3],
    [2.5, 3],
    ["5", 3],
  ])("takes %s failed checks as %s", (value, expected) => {
    expect(
      ServiceAlertPolicy.fromConfiguration({ failuresBeforeAlert: value })
        .failuresBeforeAlert,
    ).toBe(expected);
  });
});

describe("isAcceptedRecipientList", () => {
  it("accepts an empty list, which turns the alerts off", () => {
    expect(isAcceptedRecipientList("")).toBe(true);
    expect(isAcceptedRecipientList("  ")).toBe(true);
  });

  it("accepts up to 10 well-formed addresses", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `a${i}@example.com`);

    expect(isAcceptedRecipientList("ops@example.com, dev@example.org")).toBe(
      true,
    );
    expect(isAcceptedRecipientList(ten.join(","))).toBe(true);
    expect(isAcceptedRecipientList([...ten, "b@example.com"].join(","))).toBe(
      false,
    );
  });

  it("refuses a list holding something that is not an address", () => {
    expect(isAcceptedRecipientList("ops@example.com, ops")).toBe(false);
    expect(isAcceptedRecipientList("ops@localhost")).toBe(false);
    expect(isAcceptedRecipientList(["ops@example.com"])).toBe(false);
  });
});
