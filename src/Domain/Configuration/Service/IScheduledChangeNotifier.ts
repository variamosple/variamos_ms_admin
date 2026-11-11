import type { ScheduledConfigurationChange } from "../Entity/ScheduledConfigurationChange.js";

/** Tells the author of a planned change that it was not applied (EV-115). */
export interface IScheduledChangeNotifier {
  notifyNotApplied(
    change: ScheduledConfigurationChange,
    reason: string,
  ): Promise<void>;
}
