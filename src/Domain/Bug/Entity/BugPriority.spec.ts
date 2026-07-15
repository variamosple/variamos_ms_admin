import { BugPriority } from "./BugPriority";

describe("BugPriority Value Object", () => {
  it("should create a valid priority successfully", () => {
    expect(new BugPriority("low").getValue()).toBe("low");
    expect(new BugPriority("MEDIUM").getValue()).toBe("medium");
    expect(new BugPriority("high").getValue()).toBe("high");
  });

  it("should throw an error for invalid priorities", () => {
    expect(() => new BugPriority("")).toThrow(
      "Bug priority must be either 'low', 'medium', or 'high'.",
    );
    expect(() => new BugPriority("critical")).toThrow(
      "Bug priority must be either 'low', 'medium', or 'high'.",
    );
    expect(() => new BugPriority("urgent")).toThrow(
      "Bug priority must be either 'low', 'medium', or 'high'.",
    );
  });
});
