import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IServiceAlertPolicyProvider } from "#src/Domain/MicroService/Service/ServiceAlertPolicyService.js";
import type { IServiceAlertNotifier } from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";
import type { BackgroundTaskStatus } from "../Entity/BackgroundTaskStatus.js";
import {
  BackgroundTaskAlerts,
  backgroundTaskAlertOf,
} from "./BackgroundTaskAlerts.js";

const LAST_SUCCESS = new Date("2026-11-22T08:15:00Z");

const statusOf = (
  consecutiveFailures: number,
  overrides: Partial<BackgroundTaskStatus> = {},
): BackgroundTaskStatus => ({
  name: "Periodic bugs synchronization",
  intervalMs: 15 * 60 * 1000,
  running: false,
  lastRunAt: new Date("2026-11-22T09:00:00Z"),
  lastSuccessAt: LAST_SUCCESS,
  lastFailureAt: consecutiveFailures ? new Date("2026-11-22T09:00:02Z") : null,
  consecutiveFailures,
  ...overrides,
});

const setUp = (recipients: string[] = ["ops@example.com"]) => {
  const policy = mock<IServiceAlertPolicyProvider>();
  policy.getPolicy.mockResolvedValue({ recipients, failuresBeforeAlert: 3 });
  const notifier = mock<IServiceAlertNotifier>();
  const logger = mock<ILogger>();
  const alerts = new BackgroundTaskAlerts(policy, notifier, logger);
  return { alerts, notifier, logger };
};

describe("background task alerts (ADM-N34)", () => {
  it("sends nothing below the number of failures in a row", async () => {
    const { alerts, notifier } = setUp();

    await alerts.afterRun(statusOf(1));
    await alerts.afterRun(statusOf(2));
    await alerts.afterRun(statusOf(0));

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("sends a failing task once, then when it works again", async () => {
    const { alerts, notifier } = setUp();

    await alerts.afterRun(statusOf(3));
    await alerts.afterRun(statusOf(4));
    await alerts.afterRun(statusOf(0));
    await alerts.afterRun(statusOf(0));

    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(notifier.notify).toHaveBeenNthCalledWith(1, ["ops@example.com"], {
      title: "Periodic bugs synchronization keeps failing",
      body: 'The background task "Periodic bugs synchronization" of the administration failed 3 times in a row; its last success was at 2026-11-22 08:15 UTC. The cause is in the log of variamos_ms_admin, and the state of the tasks on the monitoring page.',
    });
    expect(notifier.notify).toHaveBeenNthCalledWith(
      2,
      ["ops@example.com"],
      expect.objectContaining({
        title: "Periodic bugs synchronization works again",
      }),
    );
  });

  it("follows each task on its own", async () => {
    const { alerts, notifier } = setUp();

    await alerts.afterRun(statusOf(3));
    await alerts.afterRun(statusOf(3, { name: "Journals purge" }));

    expect(notifier.notify).toHaveBeenCalledTimes(2);
  });

  it("follows the failures without an address, and sends none later for them", async () => {
    const { alerts, notifier, logger } = setUp([]);

    await alerts.afterRun(statusOf(3));
    await alerts.afterRun(statusOf(4));

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Background task alert not sent, no address in monitoring.alerts.recipients: Periodic bugs synchronization keeps failing",
    );
  });

  it("says when a task has not succeeded since the start", () => {
    expect(
      backgroundTaskAlertOf(statusOf(5, { lastSuccessAt: null })).body,
    ).toContain("it has not succeeded since the service started");
  });

  it("dates the success of a task that works again", () => {
    expect(backgroundTaskAlertOf(statusOf(0)).body).toBe(
      'The background task "Periodic bugs synchronization" of the administration succeeded again at 2026-11-22 08:15 UTC.',
    );
  });
});
