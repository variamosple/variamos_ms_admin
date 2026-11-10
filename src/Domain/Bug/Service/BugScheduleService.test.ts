import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { BugScheduleService } from "./BugScheduleService.js";

const MINUTE_MS = 60 * 1000;

const reading = (values: Record<string, unknown>) =>
  new BugScheduleService({
    queryByKey: async (request) =>
      new ResponseModel<Configuration>("t").withResponse({
        value: values[request.data as string],
      } as Configuration),
  });

describe("BugScheduleService", () => {
  it("reads the configured interval and retention", async () => {
    const schedule = reading({
      "bugs.sync_interval_minutes": 60,
      "bugs.rejected_retention_days": 30,
    });

    expect(await schedule.getSyncIntervalMs()).toBe(60 * MINUTE_MS);
    expect(await schedule.getRejectedRetentionDays()).toBe(30);
  });

  it("takes the defaults for a missing key or a failed read", async () => {
    const missing = new BugScheduleService({
      queryByKey: async () =>
        new ResponseModel<Configuration>("t").withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "not found",
        ),
    });
    const failing = new BugScheduleService({
      queryByKey: async () => {
        throw new Error("db down");
      },
    });

    for (const schedule of [missing, failing]) {
      expect(await schedule.getSyncIntervalMs()).toBe(15 * MINUTE_MS);
      expect(await schedule.getRejectedRetentionDays()).toBe(7);
    }
  });
});
