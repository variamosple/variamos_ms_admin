export class BugPriority {
  private readonly value: "low" | "medium" | "high";
  private static readonly VALID_PRIORITIES = ["low", "medium", "high"];

  public constructor(value: string) {
    if (!value || !BugPriority.VALID_PRIORITIES.includes(value.toLowerCase())) {
      throw new Error("Bug priority must be either 'low', 'medium', or 'high'.");
    }
    this.value = value.toLowerCase() as "low" | "medium" | "high";
  }

  public getValue(): "low" | "medium" | "high" {
    return this.value;
  }
}
