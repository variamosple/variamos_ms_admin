import { describe, expect, it } from "vitest";
import { isOneOf } from "./isOneOf.js";

const COLORS = ["red", "green"] as const;

describe("isOneOf", () => {
  it("accepts a value of the list", () => {
    expect(isOneOf(COLORS, "green")).toBe(true);
  });

  it.each(["blue", "", "Red", "red "])("refuses %j", (value) => {
    expect(isOneOf(COLORS, value)).toBe(false);
  });

  it("refuses everything for an empty list", () => {
    expect(isOneOf([], "red")).toBe(false);
  });
});
