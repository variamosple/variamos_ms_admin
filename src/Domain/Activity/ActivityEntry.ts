/** Values kept before and after an operation; secrets are never kept. */
export type ActivityValues = Record<string, unknown>;

type ActivityOutcome = "success" | "failed";

/**
 * One administration operation of the activity journal (T-24, EV-88 lot B):
 * who did what on which entity, with the result and the values that changed.
 */
export interface ActivityEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: ActivityOutcome;
  errorCode: string | null;
  before: ActivityValues | null;
  after: ActivityValues | null;
  transactionId: string | null;
}
