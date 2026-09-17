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

    // Determine the candidate URLs to check (targeted based on service container aliases and host)
    const candidateUrls: string[] = [];

    if (service.name === "variamos_ms_admin") {
      candidateUrls.push("http://127.0.0.1:4000/health");
      candidateUrls.push("http://localhost:4000/health");
    } else if (service.name === "variamos_ms_languages") {
      candidateUrls.push("http://variamos-ms-languages-test:4000/health");
      candidateUrls.push("http://variamos-ms-languages:4000/health");
      candidateUrls.push("http://127.0.0.1:5000/health");
      candidateUrls.push("http://localhost:5000/health");
    } else if (service.name === "vms_projects") {
      candidateUrls.push("http://variamos-ms-projects-test:10000/health");
      candidateUrls.push("http://variamos-ms-projects:10000/health");
      candidateUrls.push("http://127.0.0.1:10000/health");
      candidateUrls.push("http://localhost:10000/health");
    } else if (service.name === "variamos_ms_notifications") {
      candidateUrls.push("http://variamos-ms-notifications-test:3005/health");
      candidateUrls.push("http://variamos-ms-notifications:3005/health");
      candidateUrls.push("http://127.0.0.1:3005/health");
      candidateUrls.push("http://localhost:3005/health");
    } else {
      const cleanServiceName = service.name.replace(/_/g, "-");
      candidateUrls.push(
        `http://variamos-ms-${service.containerNamePattern}:${service.defaultPort}/health`,
      );
      candidateUrls.push(
        `http://${cleanServiceName}:${service.defaultPort}/health`,
      );
      if (service.targetUrl) {
        candidateUrls.push(`${service.targetUrl}/health`);
      }
    }

    const checkPromises = candidateUrls.map(async (url) => {
      const response = await axios.get(url, {
        timeout: 1500,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 300) {
        return response;
      }
      throw new Error(`HTTP status ${response.status}`);
    });

    try {
      const response = await promiseAny(checkPromises);
      responseTimeMs = Date.now() - startTime;
      status = response.data?.status === "DEGRADED" ? "DEGRADED" : "UP";
    } catch {
      responseTimeMs = Date.now() - startTime;
      status = "DOWN";
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

async function promiseAny<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let pending = promises.length;
    if (pending === 0) {
      reject(new Error("No promises provided"));
      return;
    }
    const errors: Error[] = [];
    promises.forEach((p, idx) => {
      p.then(resolve).catch((err: Error) => {
        errors[idx] = err;
        pending--;
        if (pending === 0) {
          reject(errors);
        }
      });
    });
  });
}
