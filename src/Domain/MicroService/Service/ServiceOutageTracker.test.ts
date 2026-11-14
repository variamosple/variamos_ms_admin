import type {
  HealthStatus,
  MicroServiceHealthInfo,
} from "../Entity/MicroServiceHealth.js";
import { ServiceOutageTracker } from "./ServiceOutageTracker.js";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 9, minute));
const check = (
  status: HealthStatus,
  minute: number,
  serviceName = "variamos_ms_languages",
): MicroServiceHealthInfo => ({
  serviceName,
  status,
  checkedAt: at(minute),
  errorMessage: status === "DOWN" ? "HTTP status 502" : undefined,
});

describe("ServiceOutageTracker", () => {
  it("reports a service down once, at the given failed check in a row", () => {
    const tracker = new ServiceOutageTracker();

    expect(tracker.observe(check("DOWN", 0), 3)).toBeNull();
    expect(tracker.observe(check("DOWN", 1), 3)).toBeNull();
    expect(tracker.observe(check("DOWN", 2), 3)).toEqual({
      kind: "down",
      serviceName: "variamos_ms_languages",
      failures: 3,
      since: at(0),
      reason: "HTTP status 502",
    });
    expect(tracker.observe(check("DOWN", 3), 3)).toBeNull();
    expect(tracker.observe(check("DOWN", 4), 3)).toBeNull();
  });

  it("reports the service back at its first answer, with the start of the outage", () => {
    const tracker = new ServiceOutageTracker();
    for (const minute of [0, 1, 2]) tracker.observe(check("DOWN", minute), 3);

    expect(tracker.observe(check("UP", 10), 3)).toEqual({
      kind: "recovered",
      serviceName: "variamos_ms_languages",
      since: at(0),
      at: at(10),
    });
    expect(tracker.observe(check("UP", 11), 3)).toBeNull();
  });

  it("starts again from zero after an answer, so two failures are not an outage", () => {
    const tracker = new ServiceOutageTracker();

    tracker.observe(check("DOWN", 0), 3);
    tracker.observe(check("DOWN", 1), 3);
    expect(tracker.observe(check("UP", 2), 3)).toBeNull();
    expect(tracker.observe(check("DOWN", 3), 3)).toBeNull();
    expect(tracker.observe(check("DOWN", 4), 3)).toBeNull();
  });

  it("takes a DEGRADED service as answering", () => {
    const tracker = new ServiceOutageTracker();
    for (const minute of [0, 1, 2]) tracker.observe(check("DOWN", minute), 3);

    expect(tracker.observe(check("DEGRADED", 3), 3)?.kind).toBe("recovered");
  });

  it("follows each service apart", () => {
    const tracker = new ServiceOutageTracker();

    tracker.observe(check("DOWN", 0, "a"), 2);
    tracker.observe(check("DOWN", 0, "b"), 2);
    expect(tracker.observe(check("UP", 1, "a"), 2)).toBeNull();
    expect(tracker.observe(check("DOWN", 1, "b"), 2)?.kind).toBe("down");
  });
});
