import type { ConfigurationValue } from "../Entity/Configuration.js";
import type {
  ScheduledChangeOutcome,
  ScheduledConfigurationChange,
} from "../Entity/ScheduledConfigurationChange.js";

export interface PlannedChange {
  previousValue: ConfigurationValue;
  newValue: ConfigurationValue;
  baseUpdatedAt: Date | null;
  dueAt: Date;
}

/** Table `scheduled_configuration_changes` (migration 0019, EV-115 lot B). */
export interface IScheduledConfigurationChangeRepository {
  /** The planned changes, then those resolved since `resolvedSince`. */
  list(resolvedSince: Date): Promise<ScheduledConfigurationChange[]>;

  findById(id: number): Promise<ScheduledConfigurationChange | null>;

  /** Null when a change of this key is already planned. */
  create(
    change: PlannedChange & { key: string; createdBy: string },
  ): Promise<ScheduledConfigurationChange | null>;

  /** Null when the change is no longer planned. */
  reschedule(
    id: number,
    change: PlannedChange & { updatedBy: string },
  ): Promise<ScheduledConfigurationChange | null>;

  /** Null when the change is no longer planned. */
  cancel(
    id: number,
    cancelledBy: string,
  ): Promise<ScheduledConfigurationChange | null>;

  /**
   * Hands each change due at `now` to `resolve`, one at a time, and
   * records its outcome. A change is held while it is resolved: another
   * instance skips it, and an edit waits. A failed resolution leaves the
   * change planned and stops this pass. Returns how many were resolved.
   */
  resolveDue(
    now: Date,
    resolve: (
      change: ScheduledConfigurationChange,
    ) => Promise<ScheduledChangeOutcome>,
  ): Promise<number>;
}
