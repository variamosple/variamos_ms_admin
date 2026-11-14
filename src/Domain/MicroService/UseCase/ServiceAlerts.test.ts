import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type {
  HealthStatus,
  MicroServiceHealthInfo,
} from "../Entity/MicroServiceHealth.js";
import { ServiceAlertPolicy } from "../Entity/ServiceAlertPolicy.js";
import type { IServiceAlertPolicyProvider } from "../Service/ServiceAlertPolicyService.js";
import {
  alertOf,
  type IServiceAlertNotifier,
  ServiceAlerts,
} from "./ServiceAlerts.js";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 9, minute));
const check = (
  status: HealthStatus,
  minute: number,
): MicroServiceHealthInfo => ({
  serviceName: "variamos_ms_languages",
  status,
  checkedAt: at(minute),
});

function setup(recipients: string) {
  const policyProvider = mock<IServiceAlertPolicyProvider>();
  policyProvider.getPolicy.mockResolvedValue(
    ServiceAlertPolicy.fromConfiguration({ recipients }),
  );
  const notifier = mock<IServiceAlertNotifier>();
  const logger = mock<ILogger>();
  const alerts = new ServiceAlerts(policyProvider, notifier, logger);
  return { alerts, notifier, logger };
}

describe("ServiceAlerts", () => {
  it("sends one mail when a service goes down, and one when it is back", async () => {
    const { alerts, notifier } = setup("ops@example.com");

    for (const minute of [0, 1, 2, 3, 4]) {
      await alerts.onHealthCheck(check("DOWN", minute));
    }
    await alerts.onHealthCheck(check("UP", 12));
    await alerts.onHealthCheck(check("UP", 13));

    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(notifier.notify.mock.calls[0]?.[0]).toEqual(["ops@example.com"]);
    expect(notifier.notify.mock.calls[0]?.[1].title).toBe(
      "variamos_ms_languages is down",
    );
    expect(notifier.notify.mock.calls[1]?.[1].title).toBe(
      "variamos_ms_languages is back",
    );
  });

  it("sends nothing without an address, and only logs the outage", async () => {
    const { alerts, notifier, logger } = setup("");

    for (const minute of [0, 1, 2]) {
      await alerts.onHealthCheck(check("DOWN", minute));
    }

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("monitoring.alerts.recipients"),
    );
  });
});

describe("alertOf", () => {
  it("says since when a service is down, and the last reason", () => {
    const alert = alertOf({
      kind: "down",
      serviceName: "variamos_ms_languages",
      failures: 3,
      since: at(0),
      reason: "HTTP status 502",
    });

    expect(alert.body).toBe(
      "variamos_ms_languages did not answer 3 health checks in a row, since 2026-11-14 09:00 UTC. Last reason: HTTP status 502. Its state is on the monitoring page of the administration.",
    );
  });

  it.each([
    [0, "less than a minute"],
    [1, "1 minute"],
    [12, "12 minutes"],
  ])("says how long the outage lasted (%s min)", (minutes, text) => {
    const alert = alertOf({
      kind: "recovered",
      serviceName: "variamos_ms_languages",
      since: at(0),
      at: at(minutes),
    });

    expect(alert.body).toContain(`after ${text} without an answer`);
  });
});
