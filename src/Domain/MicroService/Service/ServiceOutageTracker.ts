import type { MicroServiceHealthInfo } from "../Entity/MicroServiceHealth.js";

/** A service reported down, or back after it was reported down. */
export type OutageEvent =
  | {
      kind: "down";
      serviceName: string;
      failures: number;
      since: Date;
      reason?: string;
    }
  | { kind: "recovered"; serviceName: string; since: Date; at: Date };

interface Outage {
  failures: number;
  since: Date;
  reported: boolean;
}

/**
 * Follows the failed health checks of each service, in memory. A service is
 * reported down once, after the given number of failed checks in a row, and
 * reported back at its first answer after that. A DEGRADED service answers:
 * it is not down. After a restart of the admin, an outage still under way is
 * counted again from zero.
 */
export class ServiceOutageTracker {
  private readonly outages = new Map<string, Outage>();

  public observe(
    check: MicroServiceHealthInfo,
    failuresBeforeAlert: number,
  ): OutageEvent | null {
    const { serviceName } = check;
    const at = check.checkedAt ?? new Date();
    const outage = this.outages.get(serviceName);

    if (check.status !== "DOWN") {
      this.outages.delete(serviceName);
      return outage?.reported
        ? {
            kind: "recovered",
            serviceName,
            since: outage.since,
            at,
          }
        : null;
    }

    const current = outage ?? {
      failures: 0,
      since: at,
      reported: false,
    };
    current.failures += 1;
    this.outages.set(serviceName, current);
    if (current.reported || current.failures < failuresBeforeAlert) return null;

    current.reported = true;
    return {
      kind: "down",
      serviceName,
      failures: current.failures,
      since: current.since,
      reason: check.errorMessage,
    };
  }
}
