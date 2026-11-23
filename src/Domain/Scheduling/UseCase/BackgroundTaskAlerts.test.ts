import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IServiceAlertPolicyProvider } from "#src/Domain/MicroService/Service/ServiceAlertPolicyService.js";
import type { IServiceAlertNotifier } from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";
import type { BackgroundTaskStatus } from "../Entity/BackgroundTaskStatus.js";
import {
  BackgroundTaskAlerts,
  backgroundTaskAlertOf,
  failuresBeforeAlertOf,
} from "./BackgroundTaskAlerts.js";

const LAST_SUCCESS = new Date("2026-11-22T08:15:00Z");

const statusOf = (
  consecutiveFailures: number,
  overrides: Partial<BackgroundTaskStatus> = {},
): BackgroundTaskStatus => ({
  name: "Periodic bugs synchronization",
  intervalMs: 15 * 60 * 1000,
  running: false,
  runningSince: null,
  stuck: false,
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
  notifier.notify.mockResolvedValue(recipients.length);
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

  // ADM-N49: a mail server down is when a task is likely to fail too
  it("sends a failure again after the next run when no mail went out", async () => {
    const { alerts, notifier, logger } = setUp();
    notifier.notify.mockResolvedValueOnce(0);

    await alerts.afterRun(statusOf(3));
    await alerts.afterRun(statusOf(4));
    await alerts.afterRun(statusOf(5));

    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Background task alert to send again after the next run: Periodic bugs synchronization keeps failing",
    );
  });

  it("sends a recovery again when no mail went out", async () => {
    const { alerts, notifier } = setUp();
    await alerts.afterRun(statusOf(3));
    notifier.notify.mockResolvedValueOnce(0);

    await alerts.afterRun(statusOf(0));
    await alerts.afterRun(statusOf(0));
    await alerts.afterRun(statusOf(0));

    expect(notifier.notify).toHaveBeenCalledTimes(3);
    expect(notifier.notify).toHaveBeenLastCalledWith(
      ["ops@example.com"],
      expect.objectContaining({
        title: "Periodic bugs synchronization works again",
      }),
    );
  });

  // ADM-N50: three failures of a daily task would be three days
  it("alerts at the first failure of a task run once a day", async () => {
    const { alerts, notifier } = setUp();

    await alerts.afterRun(
      statusOf(1, { name: "Journals purge", intervalMs: 24 * 60 * 60 * 1000 }),
    );

    expect(notifier.notify).toHaveBeenCalledOnce();
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

describe("failuresBeforeAlertOf (ADM-N50)", () => {
  const MINUTE_MS = 60 * 1000;

  it.each([
    [3, MINUTE_MS, 3],
    [3, 15 * MINUTE_MS, 3],
    [5, 15 * MINUTE_MS, 4],
    [3, 60 * MINUTE_MS, 1],
    [3, 24 * 60 * MINUTE_MS, 1],
    [3, 0, 3],
  ])("%i configured, every %i ms: %i", (configured, intervalMs, expected) => {
    expect(failuresBeforeAlertOf(configured, intervalMs)).toBe(expected);
  });
});
