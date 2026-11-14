import type Docker from "dockerode";
import logger from "#src/common/logger.js";
import { ContainerResourceSampler } from "./ContainerResourceSampler.js";
import type { DockerStatsSample } from "./containerResources.js";

const reading = (
  totalUsage: number,
  systemUsage: number,
): DockerStatsSample => ({
  cpu_stats: {
    cpu_usage: { total_usage: totalUsage },
    system_cpu_usage: systemUsage,
    online_cpus: 2,
  },
  memory_stats: { usage: 1000, limit: 8000, stats: { inactive_file: 200 } },
});

function fakeDocker(
  running: string[][],
  readings: Record<string, DockerStatsSample[]>,
) {
  const listContainers = vi.fn();
  for (const ids of running) {
    listContainers.mockResolvedValueOnce(ids.map((Id) => ({ Id })));
  }
  const stats = vi.fn();
  const getContainer = vi.fn((id: string) => ({
    stats: (options: unknown) => {
      stats(id, options);
      const next = readings[id]?.shift();
      return next ? Promise.resolve(next) : Promise.reject(new Error("gone"));
    },
  }));
  const docker = { listContainers, getContainer } as unknown as Pick<
    Docker,
    "listContainers" | "getContainer"
  >;
  return { docker, listContainers, stats };
}

describe("ContainerResourceSampler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads only the running monitored containers, one call each, without waiting", async () => {
    const { docker, listContainers, stats } = fakeDocker([["a"]], {
      a: [reading(0, 0)],
    });

    await new ContainerResourceSampler(docker).sample();

    expect(listContainers).toHaveBeenCalledWith({
      filters: {
        label: ["variamos.service.monitored=true"],
        status: ["running"],
      },
    });
    expect(stats).toHaveBeenCalledWith("a", {
      stream: false,
      "one-shot": true,
    });
  });

  it("gives the memory at once, and the CPU from the second sample", async () => {
    const { docker } = fakeDocker([["a"], ["a"]], {
      a: [reading(0, 0), reading(100, 1000)],
    });
    const sampler = new ContainerResourceSampler(docker);

    await sampler.sample();
    expect(sampler.resourcesOf("a")).toMatchObject({
      cpuPercent: null,
      memoryUsedBytes: 800,
      memoryLimitBytes: 8000,
    });

    await sampler.sample();
    expect(sampler.resourcesOf("a")?.cpuPercent).toBe(20);
  });

  it("forgets a container that stopped, and warns about one it could not read", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { docker } = fakeDocker([["a", "b"], ["b"]], {
      a: [reading(0, 0)],
      b: [],
    });
    const sampler = new ContainerResourceSampler(docker);

    await sampler.sample();
    expect(sampler.resourcesOf("a")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      "Container resources: 1 of 2 not read: gone",
    );

    await sampler.sample();
    expect(sampler.resourcesOf("a")).toBeUndefined();
  });

  it("keeps going when Docker does not answer", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { docker, listContainers } = fakeDocker([], {});
    listContainers.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      new ContainerResourceSampler(docker).sample(),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "Container resources not sampled: connect ECONNREFUSED",
    );
  });

  it("samples at once, then at its interval, until stopped", async () => {
    vi.useFakeTimers();
    try {
      const { docker, listContainers } = fakeDocker([], {});
      listContainers.mockResolvedValue([]);
      const sampler = new ContainerResourceSampler(docker, 30_000);

      sampler.start();
      sampler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(listContainers).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(listContainers).toHaveBeenCalledTimes(2);

      sampler.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(listContainers).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
