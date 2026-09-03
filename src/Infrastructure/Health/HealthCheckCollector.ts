import {
  KNOWN_SERVICES,
  type ServiceDefinition,
} from "@src/DataProviders/MicroService/MicroServiceRepository.js";
import type { MicroServiceHealthInfo } from "@src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import axios from "axios";
import logger from "jet-logger";

export class HealthCheckCollector {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isCollecting = false;

  public constructor(
    private readonly microServiceRepository: IMicroServiceRepository,
    private readonly pollIntervalMs: number = 30000,
  ) {}

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
    if (this.isCollecting) return;
    this.isCollecting = true;

    try {
      await Promise.all(
        KNOWN_SERVICES.map((service) => this.checkService(service)),
      );
    } catch (err) {
      logger.err(
        `Error during health check collection: ${(err as Error).message}`,
      );
    } finally {
      this.isCollecting = false;
    }
  }

  private async checkService(service: ServiceDefinition): Promise<void> {
    const startTime = Date.now();
    let status: "UP" | "DEGRADED" | "DOWN" = "DOWN";
    let responseTimeMs = 0;

    // 1. Ports to test (configured defaultPort and container internal port 4000/3005/etc)
    const ports = Array.from(
      new Set([service.defaultPort, 4000, 3000, 3005, 5000, 8080, 10000]),
    );

    const urlsToTry: string[] = [`${service.targetUrl}/health`];

    for (const port of ports) {
      urlsToTry.push(`http://host.docker.internal:${port}/health`);
      urlsToTry.push(`http://127.0.0.1:${port}/health`);
      urlsToTry.push(`http://localhost:${port}/health`);
      urlsToTry.push(`http://${service.name}:${port}/health`);
      urlsToTry.push(
        `http://${service.name.replace(/_/g, "-")}:${port}/health`,
      );
      urlsToTry.push(
        `http://${service.name.replace(/_/g, "-")}-test:${port}/health`,
      );
      urlsToTry.push(`http://${service.name}_aws_main:${port}/health`);
    }

    for (const url of urlsToTry) {
      try {
        const response = await axios.get(url, {
          timeout: 2500,
          validateStatus: () => true,
        });

        responseTimeMs = Date.now() - startTime;

        if (response.status >= 200 && response.status < 300) {
          status = response.data?.status === "DEGRADED" ? "DEGRADED" : "UP";
          break;
        }
      } catch {
        // Try next network alias
      }
    }

    if (status === "DOWN" && responseTimeMs === 0) {
      responseTimeMs = Date.now() - startTime;
    }

    const healthInfo: MicroServiceHealthInfo = {
      serviceName: service.name,
      status,
      responseTimeMs,
      checkedAt: new Date(),
    };

    await this.microServiceRepository.recordHealthCheck(healthInfo);
  }
}
