import { describe, expect, it } from "vitest";
import { errorMessage, errorName } from "./errorMessage.js";

describe("errorMessage", () => {
  it("gives the message of an error", () => {
    expect(errorMessage(new TypeError("bad value"))).toBe("bad value");
  });

  it("turns any other thrown value into text", () => {
    expect(errorMessage("refused")).toBe("refused");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("errorName", () => {
  it("gives the name of an error, never its message", () => {
    expect(errorName(new TypeError("SELECT secret"))).toBe("TypeError");
  });

  it("gives the type of any other thrown value", () => {
    expect(errorName("SELECT secret")).toBe("string");
    expect(errorName(null)).toBe("object");
  });
});
