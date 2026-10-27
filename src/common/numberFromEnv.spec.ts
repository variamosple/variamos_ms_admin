import { numberFromEnv } from "./numberFromEnv.js";

describe("numberFromEnv", () => {
  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["blank", "  "],
    ["not a number", "ten"],
  ])("takes the default when the value is %s", (_case, value) => {
    expect(numberFromEnv(value, 587)).toBe(587);
  });

  it.each([
    ["465", 465],
    ["0", 0],
    [" 12 ", 12],
  ])("reads %j as %i", (value, expected) => {
    expect(numberFromEnv(value, 587)).toBe(expected);
  });
});
