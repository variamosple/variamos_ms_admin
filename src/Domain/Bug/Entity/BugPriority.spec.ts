import { BugPriority } from "./BugPriority.js";

describe("BugPriority Value Object", () => {
  it("should create a valid priority successfully", () => {
    expect(new BugPriority("low").getValue()).toBe("low");
    expect(new BugPriority("MEDIUM").getValue()).toBe("medium");
    expect(new BugPriority("high").getValue()).toBe("high");
    expect(new BugPriority("Critical").getValue()).toBe("critical");
  });

  it.each(["", "urgent", "blocker"])(
    "should throw an error for the invalid priority %j",
    (value) => {
      expect(() => new BugPriority(value)).toThrow(
        "Bug priority must be one of: low, medium, high, critical.",
      );
    },
  );
});
