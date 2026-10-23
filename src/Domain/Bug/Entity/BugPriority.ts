import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
export class BugPriority {
  private readonly value: "low" | "medium" | "high";
  private static readonly VALID_PRIORITIES = ["low", "medium", "high"];

  public constructor(value: string) {
    if (!value || !BugPriority.VALID_PRIORITIES.includes(value.toLowerCase())) {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "Bug priority must be either 'low', 'medium', or 'high'.",
      );
    }
    this.value = value.toLowerCase() as "low" | "medium" | "high";
  }

  public getValue(): "low" | "medium" | "high" {
    return this.value;
  }
}
