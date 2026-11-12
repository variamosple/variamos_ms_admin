import { describe, expect, it } from "vitest";
import { fieldOf } from "./fieldOf.js";

describe("fieldOf", () => {
  it("reads a field of an object", () => {
    expect(fieldOf({ email: "a@b.c" }, "email")).toBe("a@b.c");
  });

  it("reads an index of an array", () => {
    expect(fieldOf(["x"], "0")).toBe("x");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a text", "email"],
    ["a number", 3],
    ["an object without the field", {}],
  ])("answers undefined for %s", (_, value) => {
    expect(fieldOf(value, "email")).toBeUndefined();
  });
});
