export type HealthStatus = "UP" | "DEGRADED" | "DOWN";

export interface HealthCheckDetail {
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
  responseTimeMs: number;
  checkedAt: Date;
  checks?: Record<string, HealthCheckDetail>;
}

export interface UptimeHistorySlot {
  timestamp: Date;
  status: HealthStatus;
  responseTimeMs: number;
  uptimePercentage: number;
}

export interface MicroServiceUptimeSummary {
  serviceName: string;
  currentStatus: HealthStatus;
  uptime24hPercentage: number;
  uptime30dPercentage: number;
  averageResponseTimeMs: number;
  history: UptimeHistorySlot[];
}
