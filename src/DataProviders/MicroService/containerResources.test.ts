import {
  cpuPercentBetween,
  type DockerStatsSample,
  memoryUsedOf,
  resourcesBetween,
} from "./containerResources.js";

const sample = (
  totalUsage: number,
  systemUsage: number,
  memory: DockerStatsSample["memory_stats"] = {},
  onlineCpus = 4,
): DockerStatsSample => ({
  cpu_stats: {
    cpu_usage: { total_usage: totalUsage },
    system_cpu_usage: systemUsage,
    online_cpus: onlineCpus,
  },
  memory_stats: memory,
});

describe("cpuPercentBetween", () => {
  it("computes the CPU as docker stats does: 100 is one full core", () => {
    // A quarter of the machine's time on 4 cores: one full core
    expect(cpuPercentBetween(sample(0, 0), sample(250, 1000))).toBe(100);
    expect(cpuPercentBetween(sample(100, 0), sample(112, 1000))).toBe(4.8);
  });

  it("counts the cores from the per-CPU list when online_cpus is missing", () => {
    const current: DockerStatsSample = {
      cpu_stats: {
        cpu_usage: { total_usage: 500, percpu_usage: [1, 2] },
        system_cpu_usage: 1000,
      },
    };

    expect(cpuPercentBetween(sample(0, 0), current)).toBe(100);
  });

  it("gives nothing without an earlier sample", () => {
    expect(cpuPercentBetween(undefined, sample(250, 1000))).toBeNull();
  });

  it("gives nothing when the counters went back, after a restart", () => {
    expect(cpuPercentBetween(sample(500, 2000), sample(10, 2500))).toBeNull();
    expect(cpuPercentBetween(sample(10, 2000), sample(20, 2000))).toBeNull();
  });
});

describe("memoryUsedOf", () => {
  it("leaves out the page cache, on cgroup v2 and v1", () => {
    expect(
      memoryUsedOf(sample(0, 0, { usage: 300, stats: { inactive_file: 100 } })),
    ).toBe(200);
    expect(
      memoryUsedOf(
        sample(0, 0, { usage: 300, stats: { total_inactive_file: 50 } }),
      ),
    ).toBe(250);
  });

  it("never goes below zero, and reads a missing usage as zero", () => {
    expect(
      memoryUsedOf(sample(0, 0, { usage: 10, stats: { inactive_file: 50 } })),
    ).toBe(0);
    expect(memoryUsedOf({})).toBe(0);
  });
});

describe("resourcesBetween", () => {
  it("gives the CPU, the memory used and the limit", () => {
    const at = new Date("2026-11-14T10:00:00Z");

    expect(
      resourcesBetween(
        sample(0, 0),
        sample(250, 1000, { usage: 2048, limit: 4096 }),
        at,
      ),
    ).toEqual({
      cpuPercent: 100,
      memoryUsedBytes: 2048,
      memoryLimitBytes: 4096,
      sampledAt: at,
    });
  });
});
