import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ActivityEntry, ActivityValues } from "./ActivityEntry.js";
import type { IActivityJournal } from "./IActivityJournal.js";

/** What an operation tells the journal; the outcome comes from its answer. */
export interface ActivityDescription {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: ActivityValues | null;
  after?: ActivityValues | null;
  transactionId?: string | null;
}

const toEntry = (
  description: ActivityDescription,
  errorCode: string | number | null | undefined,
): ActivityEntry => ({
  actorId: description.actorId ?? null,
  action: description.action,
  entityType: description.entityType,
  entityId:
    description.entityId === undefined || description.entityId === null
      ? null
      : String(description.entityId),
  outcome: errorCode ? "failed" : "success",
  errorCode: errorCode ? String(errorCode) : null,
  before: description.before ?? null,
  after: description.after ?? null,
  transactionId: description.transactionId ?? null,
});

/**
 * Runs an administration operation, then records it with its outcome. A
 * refusal or a failure is recorded too; an exception is recorded as a
 * SYSTEM_ERROR and thrown again. `complete` adds what is only known after
 * the operation (the id of a created entity, for example).
 */
export async function withJournal<T>(
  journal: IActivityJournal,
  description: ActivityDescription,
  run: () => Promise<ResponseModel<T>>,
  complete?: (response: ResponseModel<T>) => Partial<ActivityDescription>,
): Promise<ResponseModel<T>> {
  let response: ResponseModel<T>;
  try {
    response = await run();
  } catch (error) {
    await journal.record(toEntry(description, DomainErrorCodes.SYSTEM_ERROR));
    throw error;
  }
  const completed = response.errorCode
    ? description
    : { ...description, ...complete?.(response) };
  await journal.record(toEntry(completed, response.errorCode));
  return response;
}
