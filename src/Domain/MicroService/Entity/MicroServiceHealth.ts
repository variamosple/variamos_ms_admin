// Result of a health check, as persisted
export type HealthStatus = "UP" | "DEGRADED" | "DOWN";

// Status shown for a service: NO_DATA when no check was ever persisted, so a
// running container is never shown UP without a measurement (EV-106)
export type ServiceStatus = HealthStatus | "NO_DATA";

export const isRunning = (containers: { state: string }[]): boolean =>
  containers.some((container) => container.state === "running");

export const resolveServiceStatus = (
  containers: { state: string }[],
  lastCheck?: HealthStatus,
): ServiceStatus => {
  // A stopped container is down, whatever its last check said
  if (containers.length > 0 && !isRunning(containers)) return "DOWN";
  if (lastCheck) return lastCheck;
  return isRunning(containers) ? "NO_DATA" : "DOWN";
};

interface HealthCheckDetail {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface MicroServiceHealthInfo {
  status: HealthStatus;
  serviceName: string;
  version?: string;
  uptimeSeconds?: number;
  responseTimeMs?: number;
  checkedAt?: Date;
  checks?: Record<string, HealthCheckDetail>;
}

export interface MicroServiceStatusInfo
  extends Omit<MicroServiceHealthInfo, "status"> {
  status: ServiceStatus;
}

export interface UptimeHistorySlot {
  timestamp: Date;
  // NO_DATA: no check during the slot
  status: ServiceStatus;
  responseTimeMs: number;
  uptimePercentage: number;
}

export interface MicroServiceUptimeSummary {
  serviceName: string;
  currentStatus: ServiceStatus;
  uptime24hPercentage: number;
  uptime30dPercentage: number;
  averageResponseTimeMs: number;
  history: UptimeHistorySlot[];
}
