import { describe, expect, it } from "vitest";
import { queryText } from "./queryText.js";

describe("queryText", () => {
  it("keeps a string, even an empty one", () => {
    expect(queryText("open")).toBe("open");
    expect(queryText("")).toBe("");
  });

  it("drops a repeated parameter, a nested object and a missing value", () => {
    expect(queryText(["a", "b"])).toBeUndefined();
    expect(queryText({ b: "c" })).toBeUndefined();
    expect(queryText(undefined)).toBeUndefined();
  });
});
