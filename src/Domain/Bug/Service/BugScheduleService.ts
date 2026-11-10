import {
  BUG_SYNC_INTERVAL_KEY,
  bugSyncIntervalMsOf,
  REJECTED_BUG_RETENTION_KEY,
  rejectedBugRetentionDaysOf,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";

export interface IBugScheduleProvider {
  getSyncIntervalMs(): Promise<number>;
  getRejectedRetentionDays(): Promise<number>;
}

/**
 * Reads the bugs.* schedule keys at each use (EV-18). A key that cannot be
 * read, or a value out of bounds, gives the default: 15 minutes between two
 * synchronizations, 7 days before a rejected bug is purged.
 */
export class BugScheduleService implements IBugScheduleProvider {
  public constructor(
    private readonly configurationRepository: Pick<
      IConfigurationRepository,
      "queryByKey"
    >,
  ) {}

  private async read(key: string): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("readBugSchedule", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch {
      // The repository logs its own failures; the default applies
      return undefined;
    }
  }

  public async getSyncIntervalMs(): Promise<number> {
    return bugSyncIntervalMsOf(await this.read(BUG_SYNC_INTERVAL_KEY));
  }

  public async getRejectedRetentionDays(): Promise<number> {
    return rejectedBugRetentionDaysOf(
      await this.read(REJECTED_BUG_RETENTION_KEY),
    );
  }
}
