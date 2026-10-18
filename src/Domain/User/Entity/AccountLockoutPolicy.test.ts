import { AccountLockoutPolicy } from "./AccountLockoutPolicy.js";

describe("AccountLockoutPolicy", () => {
  it("defaults to 10 attempts and 15 minutes", () => {
    expect(AccountLockoutPolicy.DEFAULT).toMatchObject({
      maxAttempts: 10,
      durationMinutes: 15,
      durationMs: 15 * 60 * 1000,
    });
  });

  it("takes the configured values within the bounds", () => {
    expect(
      AccountLockoutPolicy.fromConfiguration({
        maxAttempts: 3,
        durationMinutes: 1440,
      }),
    ).toMatchObject({ maxAttempts: 3, durationMinutes: 1440 });
    expect(
      AccountLockoutPolicy.fromConfiguration({
        maxAttempts: 100,
        durationMinutes: 1,
      }),
    ).toMatchObject({ maxAttempts: 100, durationMinutes: 1 });
  });

  it.each([
    [2, 0],
    [101, 1441],
    [5.5, 2.5],
    ["5", "20"],
    [null, undefined],
    [Number.NaN, Number.POSITIVE_INFINITY],
  ])(
    "falls back to the default for %j and %j",
    (maxAttempts, durationMinutes) => {
      expect(
        AccountLockoutPolicy.fromConfiguration({
          maxAttempts,
          durationMinutes,
        }),
      ).toMatchObject({ maxAttempts: 10, durationMinutes: 15 });
    },
  );
});
