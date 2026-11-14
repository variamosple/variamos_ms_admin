import type { ContainerResources } from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";

/** The fields of a Docker stats answer that the sampling reads. */
export interface DockerStatsSample {
  read?: string;
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: { inactive_file?: number; total_inactive_file?: number };
  };
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Memory in use without the page cache the kernel can take back, as
 * `docker stats` shows it: inactive_file on cgroup v2, total_inactive_file
 * on cgroup v1.
 */
export function memoryUsedOf(sample: DockerStatsSample): number {
  const memory = sample.memory_stats;
  const cache = numberOr(
    memory?.stats?.inactive_file ?? memory?.stats?.total_inactive_file,
    0,
  );
  return Math.max(0, numberOr(memory?.usage, 0) - cache);
}

/**
 * CPU used between two samples of a container, as `docker stats` computes
 * it: 100 is one full core. Null without an earlier sample, or when the
 * counters did not move forward (a restarted container starts again at 0).
 */
export function cpuPercentBetween(
  previous: DockerStatsSample | undefined,
  current: DockerStatsSample,
): number | null {
  const before = previous?.cpu_stats;
  const now = current.cpu_stats;
  if (!before || !now) return null;
  const cpuDelta =
    numberOr(now.cpu_usage?.total_usage, 0) -
    numberOr(before.cpu_usage?.total_usage, 0);
  const systemDelta =
    numberOr(now.system_cpu_usage, 0) - numberOr(before.system_cpu_usage, 0);
  if (cpuDelta < 0 || systemDelta <= 0) return null;
  const cpus = numberOr(
    now.online_cpus,
    now.cpu_usage?.percpu_usage?.length ?? 1,
  );
  return Math.round((cpuDelta / systemDelta) * cpus * 1000) / 10;
}

/** What the container uses, from this sample and the one before it. */
export function resourcesBetween(
  previous: DockerStatsSample | undefined,
  current: DockerStatsSample,
  sampledAt: Date,
): ContainerResources {
  return {
    cpuPercent: cpuPercentBetween(previous, current),
    memoryUsedBytes: memoryUsedOf(current),
    memoryLimitBytes: numberOr(current.memory_stats?.limit, 0),
    sampledAt,
  };
}
