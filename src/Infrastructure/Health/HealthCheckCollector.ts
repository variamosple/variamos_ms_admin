import type {
  MicroServiceRepositoryImpl,
  ServiceDefinition,
} from "@src/DataProviders/MicroService/MicroServiceRepository.js";
import type { MicroServiceHealthInfo } from "@src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import axios, { type AxiosResponse } from "axios";
import logger from "jet-logger";

export class HealthCheckCollector {
  private intervalTimer: NodeJS.Timeout | null = null;
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
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      logger.info("HealthCheckCollector stopped.");
    }
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

    const checkResults = await Promise.allSettled(
      uniqueUrls.map(async (url) => {
        const response = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true,
        });

        if (response.status >= 200 && response.status < 300) {
          return response;
        }
        throw new Error(`HTTP status ${response.status}`);
      }),
    );

    const successfulResult = checkResults.find(
      (r): r is PromiseFulfilledResult<AxiosResponse> =>
        r.status === "fulfilled",
    );

    responseTimeMs = Date.now() - startTime;
    if (successfulResult) {
      status =
        successfulResult.value.data?.status === "DEGRADED" ? "DEGRADED" : "UP";
    } else {
      status = "DOWN";
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
