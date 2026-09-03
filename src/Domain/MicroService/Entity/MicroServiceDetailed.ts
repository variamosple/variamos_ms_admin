import type { Labels } from "./MicroService.js";
import type {
  MicroServiceHealthInfo,
  MicroServiceUptimeSummary,
} from "./MicroServiceHealth.js";

export interface ContainerInstanceInfo {
  id: string;
  name: string;
  state: string;
  status: string;
  created: Date;
  labels: Labels;
}

export class MicroServiceDetailed {
  public constructor(
    public readonly serviceName: string,
    public readonly displayName: string,
    public readonly health: MicroServiceHealthInfo,
    public readonly replicasCount: number,
    public readonly containers: ContainerInstanceInfo[],
    public readonly uptimeSummary?: MicroServiceUptimeSummary,
    public readonly targetUrl?: string,
    public readonly version?: string,
  ) {}
}
