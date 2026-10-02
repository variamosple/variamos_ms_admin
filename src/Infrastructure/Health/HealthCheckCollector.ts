import { MicroServiceDailyStatsModel } from "@src/DataProviders/MicroService/MicroServiceDailyStatsModel.js";
import { MicroServiceHealthLogModel } from "@src/DataProviders/MicroService/MicroServiceHealthLogModel.js";
import type {
  MicroServiceRepositoryImpl,
  ServiceDefinition,
} from "@src/DataProviders/MicroService/MicroServiceRepository.js";
import type { MicroServiceHealthInfo } from "@src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import axios, { type AxiosResponse } from "axios";
import logger from "jet-logger";
import { Op } from "sequelize";

export class HealthCheckCollector {
  private intervalTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private isCollecting = false;

  private pollIntervalMs: number;

  public constructor(
    private readonly microServiceRepository: IMicroServiceRepository,
    initialPollIntervalMs: number = 30000,
  ) {
    this.pollIntervalMs = initialPollIntervalMs;
  }

  public getIntervalMs(): number {
    return this.pollIntervalMs;
  }

  public setIntervalMs(newIntervalMs: number): void {
    if (newIntervalMs < 5000) {
      logger.warn(
        `HealthCheckCollector interval ${newIntervalMs}ms too small, fallback to 5000ms`,
      );
      newIntervalMs = 5000;
    }
    this.pollIntervalMs = newIntervalMs;
    logger.info(
      `HealthCheckCollector interval updated to ${this.pollIntervalMs}ms`,
    );
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = setInterval(
        () => this.collectAll(),
        this.pollIntervalMs,
      );
    }
  }

  public start(): void {
    if (this.intervalTimer) return;
    logger.info(
      `Starting HealthCheckCollector (interval: ${this.pollIntervalMs}ms)...`,
    );
    this.collectAll();
    this.intervalTimer = setInterval(
      () => this.collectAll(),
      this.pollIntervalMs,
    );

    // Run daily aggregation & purge once every 24 hours (86,400,000 ms)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    this.runDailyAggregationAndPurge().catch((err) =>
      logger.err(
        `Daily health check aggregation failed on startup: ${(err as Error).message}`,
      ),
    );
    this.retentionTimer = setInterval(() => {
      this.runDailyAggregationAndPurge().catch((err) =>
        logger.err(
          `Daily health check aggregation failed: ${(err as Error).message}`,
        ),
      );
    }, TWENTY_FOUR_HOURS);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    logger.info("HealthCheckCollector stopped.");
  }

  /**
   * Industry Standard Tiered Retention (Downsampling):
   * 1. Consolidate raw health logs older than 1 day into microservice_daily_stats (daily uptime %, avg latency, checks).
   * 2. Purge raw health logs older than 30 days to avoid PostgreSQL table bloat.
   */
  public async runDailyAggregationAndPurge(retentionDays = 30): Promise<{
    aggregatedDays: number;
    purgedLogs: number;
  }> {
    logger.info(
      "Running daily microservice health logs aggregation and purge...",
    );

    let aggregatedDays = 0;
    let purgedLogs = 0;

    try {
      // Find distinct dates and services for logs older than today (e.g., from yesterday backwards)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const endOfYesterday = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        23,
        59,
        59,
        999,
      );

      // Aggregate day by day for raw logs that haven't yet been aggregated
      const rawLogs = await MicroServiceHealthLogModel.findAll({
        where: {
          checkedAt: {
            [Op.lte]: endOfYesterday,
          },
        },
        attributes: ["serviceName", "status", "responseTimeMs", "checkedAt"],
        order: [["checkedAt", "ASC"]],
      });

      // Group by serviceName and statDate (YYYY-MM-DD)
      const groups = new Map<
        string,
        {
          serviceName: string;
          statDate: string;
          totalChecks: number;
          successfulChecks: number;
          degradedChecks: number;
          failedChecks: number;
          totalLatency: number;
        }
      >();

      for (const log of rawLogs) {
        const dateObj = new Date(log.checkedAt);
        const statDate = dateObj.toISOString().split("T")[0];
        const groupKey = `${log.serviceName}_${statDate}`;

        let entry = groups.get(groupKey);
        if (!entry) {
          entry = {
            serviceName: log.serviceName,
            statDate,
            totalChecks: 0,
            successfulChecks: 0,
            degradedChecks: 0,
            failedChecks: 0,
            totalLatency: 0,
          };
          groups.set(groupKey, entry);
        }

        entry.totalChecks += 1;
        entry.totalLatency += log.responseTimeMs;
        if (log.status === "UP") entry.successfulChecks += 1;
        else if (log.status === "DEGRADED") entry.degradedChecks += 1;
        else entry.failedChecks += 1;
      }

      // Upsert consolidated daily statistics
      for (const group of groups.values()) {
        const uptimePercentage =
          group.totalChecks > 0
            ? Number(
                ((group.successfulChecks / group.totalChecks) * 100).toFixed(2),
              )
            : 100;
        const avgLatencyMs =
          group.totalChecks > 0
            ? Math.round(group.totalLatency / group.totalChecks)
            : 0;

        await MicroServiceDailyStatsModel.upsert({
          serviceName: group.serviceName,
          statDate: group.statDate,
          uptimePercentage,
          avgLatencyMs,
          totalChecks: group.totalChecks,
          successfulChecks: group.successfulChecks,
          degradedChecks: group.degradedChecks,
          failedChecks: group.failedChecks,
        });
        aggregatedDays++;
      }

      // Purge raw health logs older than retentionDays (default: 30 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      purgedLogs = await MicroServiceHealthLogModel.destroy({
        where: {
          checkedAt: {
            [Op.lt]: cutoffDate,
          },
        },
      });

      logger.info(
        `Daily health aggregation complete: ${aggregatedDays} daily stats saved/updated, ${purgedLogs} raw logs purged (> ${retentionDays} days).`,
      );
    } catch (err) {
      logger.err(
        `Failed to run daily health check aggregation and purge: ${(err as Error).message}`,
      );
    }

    return { aggregatedDays, purgedLogs };
  }

  public async collectAll(): Promise<void> {
    await this.triggerHealthChecks();
  }

  public async triggerHealthChecks(
    serviceName?: string,
  ): Promise<MicroServiceHealthInfo[]> {
    if (this.isCollecting) return [];
    this.isCollecting = true;

    const results: MicroServiceHealthInfo[] = [];

    try {
      // Dynamic service discovery from repository
      let services: ServiceDefinition[] = [];
      if ("discoverServiceDefinitions" in this.microServiceRepository) {
        services = await (
          this.microServiceRepository as MicroServiceRepositoryImpl
        ).discoverServiceDefinitions();
      }

      const targetServices = serviceName
        ? services.filter(
            (s) =>
              s.name.toLowerCase() === serviceName.toLowerCase() ||
              s.displayName.toLowerCase() === serviceName.toLowerCase(),
          )
        : services;

      for (const service of targetServices) {
        const info = await this.checkService(service);
        results.push(info);
      }
    } catch (err) {
      logger.err(
        `Error during health check collection: ${(err as Error).message}`,
      );
    } finally {
      this.isCollecting = false;
    }

    return results;
  }

  public async checkService(
    service: ServiceDefinition,
  ): Promise<MicroServiceHealthInfo> {
    const startTime = Date.now();
    let status: "UP" | "DEGRADED" | "DOWN" = "DOWN";
    let responseTimeMs = 0;

    const path = service.healthPath || "/health";
    const cleanServiceName = service.name.replace(/_/g, "-");
    const containerPattern = service.containerNamePattern || cleanServiceName;

    // Dynamically build candidate URLs for both Docker internal network and local host environments
    const candidateUrls: string[] = [];

    // 1. If running as variamos_ms_admin itself
    if (service.name === "variamos_ms_admin") {
      candidateUrls.push(`http://127.0.0.1:${service.defaultPort}${path}`);
      candidateUrls.push(`http://localhost:${service.defaultPort}${path}`);
    } else {
      // 2. Container DNS hostnames on Docker network
      if (containerPattern) {
        candidateUrls.push(
          `http://${containerPattern}:${service.defaultPort}${path}`,
        );
        candidateUrls.push(
          `http://${containerPattern}-test:${service.defaultPort}${path}`,
        );
      }
      if (cleanServiceName && cleanServiceName !== containerPattern) {
        candidateUrls.push(
          `http://${cleanServiceName}:${service.defaultPort}${path}`,
        );
        candidateUrls.push(
          `http://${cleanServiceName}-test:${service.defaultPort}${path}`,
        );
      }
      // 3. Host mapped URL if available
      if (
        service.targetUrl &&
        !service.targetUrl.includes("localhost") &&
        !service.targetUrl.includes("127.0.0.1")
      ) {
        candidateUrls.push(`${service.targetUrl.replace(/\/+$/, "")}${path}`);
      }
    }

    // Deduplicate candidate URLs
    const uniqueUrls = Array.from(new Set(candidateUrls));

    try {
      const successfulResult = await Promise.any(
        uniqueUrls.map(async (url) => {
          const reqStart = Date.now();
          const response = await axios.get(url, {
            timeout: 5000,
            validateStatus: () => true,
          });

          if (response.status >= 200 && response.status < 300) {
            return { response, latency: Date.now() - reqStart };
          }
          throw new Error(`HTTP status ${response.status}`);
        }),
      );

      status =
        successfulResult.response.data?.status === "DEGRADED"
          ? "DEGRADED"
          : "UP";
      responseTimeMs = successfulResult.latency;
    } catch (aggregateError) {
      // All candidate URLs failed
      status = "DOWN";
      responseTimeMs = Date.now() - startTime;
    }

    const healthInfo: MicroServiceHealthInfo = {
      serviceName: service.name,
      status,
      responseTimeMs,
      checkedAt: new Date(),
    };

    await this.microServiceRepository.recordHealthCheck(healthInfo);
    return healthInfo;
  }
}
