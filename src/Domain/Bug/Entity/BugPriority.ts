import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

// Severity of a bug; "critical" comes from the specification (EV-84 lot 5)
export const BUG_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type BugPriorityValue = (typeof BUG_PRIORITIES)[number];

export const isBugPriority = (value: string): value is BugPriorityValue =>
  (BUG_PRIORITIES as readonly string[]).includes(value);

export class BugPriority {
  private readonly value: BugPriorityValue;

  public constructor(value: string) {
    this.value = BugPriority.parse(value);
  }

  /** The priority in lower case; throws INVALID_INPUT when it is unknown. */
  public static parse(value: string): BugPriorityValue {
    const lower = value?.toLowerCase() ?? "";
    if (!isBugPriority(lower)) {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        `Bug priority must be one of: ${BUG_PRIORITIES.join(", ")}.`,
      );
    }
    return lower;
  }

  public getValue(): BugPriorityValue {
    return this.value;
  }
}
