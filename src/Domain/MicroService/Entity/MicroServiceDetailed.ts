import type { Labels } from "./MicroService.js";
import type {
  MicroServiceStatusInfo,
  MicroServiceUptimeSummary,
} from "./MicroServiceHealth.js";

/**
 * What a running container uses, sampled every 30 s. cpuPercent follows the
 * convention of `docker stats`: 100 is one full core. Null until two samples
 * of the container exist.
 */
export interface ContainerResources {
  cpuPercent: number | null;
  memoryUsedBytes: number;
  /** The container's memory limit, or the machine's memory without one. */
  memoryLimitBytes: number;
  sampledAt: Date;
}

export interface ContainerInstanceInfo {
  id: string;
  name: string;
  state: string;
  status: string;
  created: Date;
  labels: Labels;
  /** Absent for a stopped container, or before its first sample. */
  resources?: ContainerResources;
}

/** A service with its health, containers and uptime. */
export interface MicroServiceDetailedFields {
  serviceName: string;
  displayName: string;
  health: MicroServiceStatusInfo;
  replicasCount: number;
  containers: ContainerInstanceInfo[];
  uptimeSummary?: MicroServiceUptimeSummary;
  targetUrl?: string;
  version?: string;
}

export class MicroServiceDetailed {
  public readonly serviceName: string;
  public readonly displayName: string;
  public readonly health: MicroServiceStatusInfo;
  public readonly replicasCount: number;
  public readonly containers: ContainerInstanceInfo[];
  public readonly uptimeSummary?: MicroServiceUptimeSummary;
  public readonly targetUrl?: string;
  public readonly version?: string;

  public constructor(fields: MicroServiceDetailedFields) {
    const {
      serviceName,
      displayName,
      health,
      replicasCount,
      containers,
      uptimeSummary,
      targetUrl,
      version,
    } = fields;
    this.serviceName = serviceName;
    this.displayName = displayName;
    this.health = health;
    this.replicasCount = replicasCount;
    this.containers = containers;
    this.uptimeSummary = uptimeSummary;
    this.targetUrl = targetUrl;
    this.version = version;
  }
}
