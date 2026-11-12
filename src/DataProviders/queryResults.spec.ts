import { describe, expect, it } from "vitest";
import { rowCountOf } from "./queryResults.js";

describe("rowCountOf", () => {
  it("reads the row count of a driver result", () => {
    expect(rowCountOf({ rowCount: 3, rows: [] })).toBe(3);
  });

  it.each([
    ["no result", undefined],
    ["null", null],
    ["a number", 3],
    ["no count", {}],
    ["a count that is not a number", { rowCount: "3" }],
    ["a null count", { rowCount: null }],
  ])("answers 0 for %s", (_, result) => {
    expect(rowCountOf(result)).toBe(0);
  });
});
