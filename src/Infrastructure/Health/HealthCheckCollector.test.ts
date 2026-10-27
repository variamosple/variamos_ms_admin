import axios from "axios";
import logger from "#src/common/logger.js";
import type { MicroServiceHealthInfo } from "#src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { ServiceDefinition } from "#src/Domain/MicroService/Entity/ServiceDefinition.js";
import type { IHealthLogArchive } from "#src/Domain/MicroService/Repository/IHealthLogArchive.js";
import type { IMicroServiceRepository } from "#src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import {
  HealthCheckCollector,
  mapWithConcurrency,
} from "./HealthCheckCollector.js";

// The tests that do not reach the retention
const noArchive = {} as IHealthLogArchive;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("keeps the order of the items whatever the completion order", async () => {
    const outcomes = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms;
    });

    expect(outcomes).toEqual([
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
    ]);
  });

  it("never runs more tasks at once than the limit", async () => {
    let running = 0;
    let maxRunning = 0;

    await mapWithConcurrency(Array.from({ length: 10 }), 4, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await delay(5);
      running--;
    });

    expect(maxRunning).toBe(4);
  });

  it("goes on when a task fails", async () => {
    const outcomes = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });

    expect(outcomes.map((o) => o.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });

  it("returns an empty list for no items", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});

describe("HealthCheckCollector.triggerHealthChecks", () => {
  const services: ServiceDefinition[] = Array.from({ length: 7 }, (_, i) => ({
    name: `service_${i}`,
    displayName: `Service ${i}`,
    defaultPort: 3000 + i,
    healthPath: "/health",
  })) as ServiceDefinition[];

  const repository = () =>
    ({
      discoverServiceDefinitions: vi.fn().mockResolvedValue(services),
      recordHealthCheck: vi.fn().mockResolvedValue(undefined),
    }) as unknown as IMicroServiceRepository;

  // Fake check: every service takes 40 ms, odd ones are DOWN
  const fakeCheck = async (
    service: ServiceDefinition,
  ): Promise<MicroServiceHealthInfo> => {
    await delay(40);
    const index = Number(service.name.split("_")[1]);
    return {
      serviceName: service.name,
      status: index % 2 ? "DOWN" : "UP",
      responseTimeMs: 40,
      checkedAt: new Date(),
    };
  };

  const run = async (concurrency: number) => {
    const collector = new HealthCheckCollector(
      repository(),
      noArchive,
      30000,
      concurrency,
    );
    vi.spyOn(collector, "checkService").mockImplementation(fakeCheck);
    const start = Date.now();
    const results = await collector.triggerHealthChecks();
    return { results, durationMs: Date.now() - start };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same statuses, in the same order, as one check at a time", async () => {
    const sequential = await run(1);
    const parallel = await run(4);

    const summary = (r: MicroServiceHealthInfo[]) =>
      r.map((info) => `${info.serviceName}:${info.status}`);
    expect(summary(parallel.results)).toEqual(summary(sequential.results));
    expect(parallel.results).toHaveLength(7);
  });

  it("checks services in parallel batches", async () => {
    const sequential = await run(1);
    const parallel = await run(4);

    // 7 services: 7 rounds one at a time, 2 rounds four at a time
    expect(sequential.durationMs).toBeGreaterThanOrEqual(7 * 40);
    expect(parallel.durationMs).toBeLessThan(5 * 40);
  });

  it("keeps the other results when one check throws", async () => {
    vi.spyOn(logger, "err").mockImplementation(() => {});
    const collector = new HealthCheckCollector(
      repository(),
      noArchive,
      30000,
      4,
    );
    vi.spyOn(collector, "checkService").mockImplementation(async (service) => {
      if (service.name === "service_3") throw new Error("database down");
      return fakeCheck(service);
    });

    const results = await collector.triggerHealthChecks();

    expect(results.map((r) => r.serviceName)).not.toContain("service_3");
    expect(results).toHaveLength(6);
  });
});

describe("HealthCheckCollector.checkService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts the other candidate requests once one URL answers", async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(axios, "get").mockImplementation((url, config) => {
      const signal = config?.signal as AbortSignal;
      signals.push(signal);
      if (String(url).includes("10.0.0.1")) {
        return Promise.resolve({ status: 200, data: { status: "UP" } });
      }
      // The other candidate never answers until it is aborted
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const repo = {
      recordHealthCheck: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMicroServiceRepository;
    const collector = new HealthCheckCollector(repo, noArchive);

    const info = await collector.checkService({
      name: "variamos_ms_languages",
      displayName: "Languages",
      defaultPort: 4000,
      healthPath: "/health",
      containerIps: ["10.0.0.1"],
      containerNamePattern: "variamos-ms-languages",
    } as ServiceDefinition);

    expect(info.status).toBe("UP");
    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("HealthCheckCollector.runDailyAggregationAndPurge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the complete days still whole, then purges the older checks", async () => {
    const aggregateDays = vi.fn().mockResolvedValue(58);
    const purgeChecksBefore = vi.fn().mockResolvedValue(2880);
    const collector = new HealthCheckCollector(
      {} as IMicroServiceRepository,
      { aggregateDays, purgeChecksBefore },
      30000,
      4,
    );

    const outcome = await collector.runDailyAggregationAndPurge(
      30,
      new Date("2026-10-25T09:30:00.000Z"),
    );

    // 25 September is already partly purged; 25 October is not over
    expect(aggregateDays).toHaveBeenCalledWith(
      new Date("2026-09-26T00:00:00.000Z"),
      new Date("2026-10-25T00:00:00.000Z"),
    );
    expect(purgeChecksBefore).toHaveBeenCalledWith(
      new Date("2026-09-25T09:30:00.000Z"),
    );
    expect(outcome).toEqual({ aggregatedDays: 58, purgedLogs: 2880 });
  });
});
