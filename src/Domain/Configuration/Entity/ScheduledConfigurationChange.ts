import { isAnnouncedConfiguration } from "./AnnouncedConfigurationKeys.js";
import type { ConfigurationValue } from "./Configuration.js";

export const SCHEDULED_CHANGE_STATUSES = [
  "scheduled",
  "applied",
  "cancelled",
  "conflict",
  "refused",
] as const;

export type ScheduledChangeStatus = (typeof SCHEDULED_CHANGE_STATUSES)[number];

/**
 * A change of a setting planned for a later date (EV-115 lot B), applied
 * by the background jobs when it is due.
 */
export interface ScheduledConfigurationChange {
  id: number;
  key: string;
  /** The value when the change was planned. */
  previousValue: ConfigurationValue;
  newValue: ConfigurationValue;
  /** When the setting was last changed, as the change was planned. */
  baseUpdatedAt: Date | null;
  dueAt: Date;
  status: ScheduledChangeStatus;
  /** Why it was not applied, or how it was. */
  reason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

/** How a due change ended. */
export type ScheduledChangeOutcome = {
  status: "applied" | "conflict" | "refused";
  reason: string | null;
};

/** A change can be planned at most a year ahead. */
export const SCHEDULE_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

/** Only the settings users notice are planned ahead, to be announced. */
export const canScheduleConfiguration = isAnnouncedConfiguration;

/** Why a change cannot be due at that date; null when it can. */
export const refusalOfDueDate = (dueAt: Date, now: Date): string | null => {
  if (Number.isNaN(dueAt.getTime()))
    return "The date of the change is invalid.";
  if (dueAt.getTime() <= now.getTime()) {
    return "The date of the change must be in the future.";
  }
  if (dueAt.getTime() - now.getTime() > SCHEDULE_HORIZON_MS) {
    return "The date of the change must be within a year.";
  }
  return null;
};

export const sameConfigurationValue = (
  a: ConfigurationValue,
  b: ConfigurationValue,
): boolean => JSON.stringify(a) === JSON.stringify(b);

export const CHANGED_BY_HAND =
  "The setting was changed after this change was planned; it was left as it was.";
export const ALREADY_SET = "The setting already had this value.";

/**
 * What to do with a due change, given the setting as it now is: nothing
 * when it already has the new value; a conflict when it was changed since
 * the change was planned, even back to the same value, so that a value set
 * by hand is never overwritten in silence; otherwise apply it.
 */
export const decisionAtDueDate = (
  change: Pick<
    ScheduledConfigurationChange,
    "previousValue" | "newValue" | "baseUpdatedAt"
  >,
  current: { value: ConfigurationValue; updatedAt?: Date },
): "apply" | ScheduledChangeOutcome => {
  if (sameConfigurationValue(current.value, change.newValue)) {
    return { status: "applied", reason: ALREADY_SET };
  }
  const changedSince =
    !sameConfigurationValue(current.value, change.previousValue) ||
    (change.baseUpdatedAt !== null &&
      current.updatedAt !== undefined &&
      current.updatedAt.getTime() !== change.baseUpdatedAt.getTime());
  return changedSince
    ? { status: "conflict", reason: CHANGED_BY_HAND }
    : "apply";
};
