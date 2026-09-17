import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceAuditEntry } from "@src/Domain/MicroService/Entity/MicroServiceAuditEntry.js";
import { MicroServiceConfigItem } from "@src/Domain/MicroService/Entity/MicroServiceConfigItem.js";
import {
  type ContainerInstanceInfo,
  MicroServiceDetailed,
} from "@src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter.js";
import type {
  HealthStatus,
  MicroServiceHealthInfo,
  MicroServiceUptimeSummary,
  UptimeHistorySlot,
} from "@src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import Docker from "dockerode";
import logger from "jet-logger";
import { Op } from "sequelize";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";
import { MicroServiceConfigurationModel } from "./MicroServiceConfigurationModel.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";

export interface ServiceDefinition {
  name: string;
  displayName: string;
  targetUrl: string;
  containerNamePattern: string;
  defaultPort: number;
}

export const KNOWN_SERVICES: ServiceDefinition[] = [
  {
    name: "variamos_ms_admin",
    displayName: "Admin Service",
    targetUrl: "http://localhost:4000",
    containerNamePattern: "admin",
    defaultPort: 4000,
  },
  {
    name: "variamos_ms_languages",
    displayName: "Languages Service",
    targetUrl: "http://localhost:5000",
    containerNamePattern: "language",
    defaultPort: 5000,
  },
  {
    name: "vms_projects",
    displayName: "Projects Service",
    targetUrl: "http://localhost:10000",
    containerNamePattern: "project",
    defaultPort: 10000,
  },
  {
    name: "variamos_ms_notifications",
    displayName: "Notifications Service",
    targetUrl: "http://localhost:3005",
    containerNamePattern: "notification",
    defaultPort: 3005,
  },
  {
    name: "semantic_translator",
    displayName: "Semantic Translator",
    targetUrl: "http://localhost:5001",
    containerNamePattern: "semantic",
    defaultPort: 5001,
  },
  {
    name: "vms_domain_application",
    displayName: "Domain Application",
    targetUrl: "http://localhost:8081",
    containerNamePattern: "domain",
    defaultPort: 8081,
  },
  {
    name: "vms_requirements_autocomplete",
    displayName: "Requirements Autocomplete",
    targetUrl: "http://localhost:8080",
    containerNamePattern: "autocomplete",
    defaultPort: 8080,
  },
  {
    name: "vms_language_reviews",
    displayName: "Language Reviews",
    targetUrl: "http://localhost:3001",
    containerNamePattern: "review",
    defaultPort: 3001,
  },
];

export class MicroServiceRepositoryImpl implements IMicroServiceRepository {
  private dockerConnection: Docker;

  public constructor(config: { socketPath: string }) {
    this.dockerConnection = new Docker({
      socketPath: config.socketPath,
    });
  }

  public async queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroServiceDetailed[]>> {
    const response = new ResponseModel<MicroServiceDetailed[]>(
      request.transactionId,
    );

    try {
      const { data: filter } = request;
      let containers: Docker.ContainerInfo[] = [];

      try {
        containers = await this.dockerConnection.listContainers({ all: true });
      } catch (err) {
        logger.warn(`Docker listContainers warning: ${(err as Error).message}`);
      }

      const services: MicroServiceDetailed[] = [];

      const matchedContainerIds = new Set<string>();

      const knownServicesResults = await Promise.all(
        KNOWN_SERVICES.map(async (def) => {
          if (
            filter?.name &&
            !def.displayName
              .toLowerCase()
              .includes(filter.name.toLowerCase()) &&
            !def.name.toLowerCase().includes(filter.name.toLowerCase())
          ) {
            return null;
          }

          // Match containers belonging to this service
          const matchedContainers = containers.filter((c) =>
            c.Names.some((n) =>
              n.toLowerCase().includes(def.containerNamePattern.toLowerCase()),
            ),
          );

          for (const c of matchedContainers) {
            matchedContainerIds.add(c.Id);
          }

          const containerInfos: ContainerInstanceInfo[] = matchedContainers.map(
            (c) => ({
              id: c.Id,
              name: c.Names[0]?.replace(/^\//, "") ?? c.Id,
              state: c.State,
              status: c.Status,
              created: new Date(c.Created * 1000),
              labels: c.Labels,
            }),
          );

          // Concurrently fetch latest health log and calculate uptime summary
          const [latestHealthLog, uptimeSummary] = await Promise.all([
            MicroServiceHealthLogModel.findOne({
              where: { serviceName: def.name },
              order: [["checked_at", "DESC"]],
            }).catch((err) => {
              logger.warn(
                `Could not query latest health log: ${(err as Error).message}`,
              );
              return null;
            }),
            this.calculateUptimeSummary(def.name).catch((err) => {
              logger.warn(
                `Could not calculate uptime summary: ${(err as Error).message}`,
              );
              return undefined;
            }),
          ]);

          const isContainerExplicitlyStopped =
            containerInfos.length > 0 &&
            !containerInfos.some((c) => c.state === "running");

          const status: HealthStatus = isContainerExplicitlyStopped
            ? "DOWN"
            : latestHealthLog
              ? latestHealthLog.status
              : containerInfos.some((c) => c.state === "running")
                ? "UP"
                : "DOWN";

          const healthInfo: MicroServiceHealthInfo = {
            status,
            serviceName: def.name,
            responseTimeMs: latestHealthLog?.responseTimeMs ?? 0,
            checkedAt: latestHealthLog?.checkedAt ?? new Date(),
          };

          return new MicroServiceDetailed(
            def.name,
            def.displayName,
            healthInfo,
            containerInfos.length || (status === "UP" ? 1 : 0),
            containerInfos,
            uptimeSummary,
            def.targetUrl,
          );
        }),
      );

      for (const res of knownServicesResults) {
        if (res) {
          services.push(res);
        }
      }

      // Add any other running Docker container discovered on the host (dynamic docker ps)
      const otherContainers = containers.filter(
        (c) => !matchedContainerIds.has(c.Id),
      );
      for (const c of otherContainers) {
        const rawName = c.Names[0]?.replace(/^\//, "") ?? c.Id.substring(0, 12);
        if (
          filter?.name &&
          !rawName.toLowerCase().includes(filter.name.toLowerCase())
        ) {
          continue;
        }

        const containerInfo: ContainerInstanceInfo = {
          id: c.Id,
          name: rawName,
          state: c.State,
          status: c.Status,
          created: new Date(c.Created * 1000),
          labels: c.Labels,
        };

        services.push(
          new MicroServiceDetailed(
            rawName,
            rawName,
            {
              status: c.State === "running" ? "UP" : "DOWN",
              serviceName: rawName,
              responseTimeMs: 0,
              checkedAt: new Date(),
            },
            1,
            [containerInfo],
          ),
        );
      }

      response.data = services;
      response.totalCount = services.length;
    } catch (error) {
      logger.err("Error in queryMicroServices:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async queryByName(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceDetailed>> {
    const response = new ResponseModel<MicroServiceDetailed>(
      request.transactionId,
    );
    const serviceName = request.data;

    try {
      const def = KNOWN_SERVICES.find(
        (s) =>
          s.name === serviceName ||
          s.displayName.toLowerCase() === serviceName?.toLowerCase(),
      );

      if (!def) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Service ${serviceName} not found`,
        );
      }

      let containers: Docker.ContainerInfo[] = [];
      try {
        containers = await this.dockerConnection.listContainers({ all: true });
      } catch (err) {
        logger.warn(`Docker connection warning: ${(err as Error).message}`);
      }

      const matchedContainers = containers.filter((c) =>
        c.Names.some((n) =>
          n.toLowerCase().includes(def.containerNamePattern.toLowerCase()),
        ),
      );

      const containerInfos: ContainerInstanceInfo[] = matchedContainers.map(
        (c) => ({
          id: c.Id,
          name: c.Names[0]?.replace(/^\//, "") ?? c.Id,
          state: c.State,
          status: c.Status,
          created: new Date(c.Created * 1000),
          labels: c.Labels,
        }),
      );

      const latestHealthLog = await MicroServiceHealthLogModel.findOne({
        where: { serviceName: def.name },
        order: [["checked_at", "DESC"]],
      });

      const isContainerExplicitlyStopped =
        containerInfos.length > 0 &&
        !containerInfos.some((c) => c.state === "running");

      const status: HealthStatus = isContainerExplicitlyStopped
        ? "DOWN"
        : latestHealthLog
          ? latestHealthLog.status
          : containerInfos.some((c) => c.state === "running")
            ? "UP"
            : "DOWN";

      const healthInfo: MicroServiceHealthInfo = {
        status,
        serviceName: def.name,
        responseTimeMs: latestHealthLog?.responseTimeMs ?? 0,
        checkedAt: latestHealthLog?.checkedAt ?? new Date(),
      };

      const uptimeSummary = await this.calculateUptimeSummary(def.name);

      response.data = new MicroServiceDetailed(
        def.name,
        def.displayName,
        healthInfo,
        containerInfos.length || 1,
        containerInfos,
        uptimeSummary,
        def.targetUrl,
      );
    } catch (error) {
      logger.err("Error in queryByName:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  private async resolveContainer(
    idOrServiceName: string,
  ): Promise<Docker.Container | null> {
    try {
      const containers = await this.dockerConnection.listContainers({
        all: true,
      });

      // 1. Direct ID match
      const directMatch = containers.find(
        (c) => c.Id === idOrServiceName || c.Id.startsWith(idOrServiceName),
      );
      if (directMatch) {
        return this.dockerConnection.getContainer(directMatch.Id);
      }

      // 2. Direct Name match (e.g. /variamos-ms-admin-test)
      const cleanTarget = idOrServiceName.replace(/^\//, "").toLowerCase();
      const nameMatch = containers.find((c) =>
        c.Names.some((n) => n.replace(/^\//, "").toLowerCase() === cleanTarget),
      );
      if (nameMatch) {
        return this.dockerConnection.getContainer(nameMatch.Id);
      }

      // 3. Search in KNOWN_SERVICES by definition pattern
      const def = KNOWN_SERVICES.find(
        (s) =>
          s.name.toLowerCase() === cleanTarget ||
          s.displayName.toLowerCase() === cleanTarget,
      );
      const pattern =
        def?.containerNamePattern ||
        cleanTarget.replace(/^variamos[-_](ms[-_])?/, "");

      const patternMatch = containers.find((c) =>
        c.Names.some((n) => n.toLowerCase().includes(pattern.toLowerCase())),
      );

      if (patternMatch) {
        return this.dockerConnection.getContainer(patternMatch.Id);
      }
    } catch (err) {
      logger.warn(
        `Could not resolve Docker container for ${idOrServiceName}: ${(err as Error).message}`,
      );
    }
    return null;
  }

  public async startMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Microservice ID is required",
      );
    }
    try {
      const container = await this.resolveContainer(request.data);
      if (!container) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Container not found for service ${request.data}`,
        );
      }
      await container.start();

      await MicroServiceAuditLogModel.create({
        serviceName: request.data,
        actionType: "START",
        details: { target: request.data },
        performedBy: "admin",
      });

      await MicroServiceHealthLogModel.create({
        serviceName: request.data,
        status: "UP",
        responseTimeMs: 50,
        checkedAt: new Date(),
      }).catch((err) => {
        logger.warn(`Could not log health UP: ${(err as Error).message}`);
      });
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to start microservice container",
      );
    }
    return response;
  }

  public async stopMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Microservice ID is required",
      );
    }
    try {
      const container = await this.resolveContainer(request.data);
      if (!container) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Container not found for service ${request.data}`,
        );
      }
      await container.stop();

      await MicroServiceAuditLogModel.create({
        serviceName: request.data,
        actionType: "STOP",
        details: { target: request.data },
        performedBy: "admin",
      });

      await MicroServiceHealthLogModel.create({
        serviceName: request.data,
        status: "DOWN",
        responseTimeMs: 0,
        checkedAt: new Date(),
      }).catch((err) => {
        logger.warn(`Could not log health DOWN: ${(err as Error).message}`);
      });
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to stop microservice container",
      );
    }
    return response;
  }

  public async restartMicroService(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Microservice ID is required",
      );
    }
    try {
      const container = await this.resolveContainer(request.data);
      if (!container) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Container not found for service ${request.data}`,
        );
      }
      await container.restart();

      await MicroServiceAuditLogModel.create({
        serviceName: request.data,
        actionType: "RESTART",
        details: { target: request.data },
        performedBy: "admin",
      });

      await MicroServiceHealthLogModel.create({
        serviceName: request.data,
        status: "UP",
        responseTimeMs: 50,
        checkedAt: new Date(),
      }).catch((err) => {
        logger.warn(`Could not log health UP: ${(err as Error).message}`);
      });
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to restart microservice container",
      );
    }
    return response;
  }

  public async scaleMicroService(
    request: RequestModel<{ serviceName: string; replicas: number }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    if (!request.data?.serviceName) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name is required",
      );
    }
    try {
      const { serviceName, replicas } = request.data;
      logger.info(`Scaling service ${serviceName} to ${replicas} replicas.`);

      await MicroServiceAuditLogModel.create({
        serviceName,
        actionType: "SCALE_CHANGE",
        details: { requestedReplicas: replicas },
        performedBy: "admin",
      });
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to scale microservice",
      );
    }
    return response;
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const response = new ResponseModel<NodeJS.ReadableStream>(
      request.transactionId,
    );
    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Microservice ID is required",
      );
    }
    try {
      const container = await this.resolveContainer(request.data);
      if (!container) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Container not found for service ${request.data}`,
        );
      }
      response.data = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
        timestamps: true,
      });
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }
    return response;
  }

  public async getHealthHistory(
    request: RequestModel<{ serviceName: string; days?: number }>,
  ): Promise<ResponseModel<MicroServiceUptimeSummary>> {
    const response = new ResponseModel<MicroServiceUptimeSummary>(
      request.transactionId,
    );
    if (!request.data?.serviceName) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name is required",
      );
    }
    try {
      const { serviceName, days = 30 } = request.data;
      const summary = await this.calculateUptimeSummary(serviceName, days);
      response.data = summary;
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to fetch health history",
      );
    }
    return response;
  }

  public async recordHealthCheck(
    healthInfo: MicroServiceHealthInfo,
  ): Promise<void> {
    try {
      await MicroServiceHealthLogModel.create({
        serviceName: healthInfo.serviceName,
        status: healthInfo.status,
        responseTimeMs: healthInfo.responseTimeMs,
        httpStatusCode: healthInfo.status === "UP" ? 200 : 500,
        errorMessage:
          healthInfo.status === "DOWN"
            ? "Service unreachable or unhealthy"
            : undefined,
      });
    } catch (error) {
      logger.err(
        `Failed to record health check for ${healthInfo.serviceName}: ${(error as Error).message}`,
      );
    }
  }

  public async queryConfigurations(
    request: RequestModel<string>,
  ): Promise<ResponseModel<MicroServiceConfigItem[]>> {
    const response = new ResponseModel<MicroServiceConfigItem[]>(
      request.transactionId,
    );
    const serviceName = request.data;
    if (!serviceName) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name is required",
      );
    }

    try {
      const configs = await MicroServiceConfigurationModel.findAll({
        where: { serviceName },
        order: [["config_key", "ASC"]],
      });

      response.data = configs.map(
        (c) =>
          new MicroServiceConfigItem(
            c.id,
            c.serviceName,
            c.configKey,
            c.configValue,
            (c.valueType as "string" | "number" | "boolean" | "json") ||
              "string",
            c.isSecret,
            c.isReadOnly,
            c.description,
            c.updatedBy,
            c.createdAt,
            c.updatedAt,
          ),
      );
      response.totalCount = configs.length;
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to query configurations",
      );
    }

    return response;
  }

  public async updateConfiguration(
    request: RequestModel<{
      serviceName: string;
      key: string;
      value: string;
      operatorId: string;
    }>,
  ): Promise<ResponseModel<MicroServiceConfigItem>> {
    const response = new ResponseModel<MicroServiceConfigItem>(
      request.transactionId,
    );
    if (!request.data?.serviceName || !request.data?.key) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name and key are required",
      );
    }
    const { serviceName, key, value, operatorId } = request.data;

    try {
      const [config] = await MicroServiceConfigurationModel.upsert({
        serviceName,
        configKey: key,
        configValue: value,
        valueType: "string",
        isSecret: false,
        isReadOnly: false,
        updatedBy: operatorId,
      });

      await MicroServiceAuditLogModel.create({
        serviceName,
        actionType: "CONFIG_UPDATE",
        details: { key, newValue: value },
        performedBy: operatorId,
      });

      response.data = new MicroServiceConfigItem(
        config.id,
        config.serviceName,
        config.configKey,
        config.configValue,
        (config.valueType as "string" | "number" | "boolean" | "json") ||
          "string",
        config.isSecret,
        config.isReadOnly,
        config.description,
        config.updatedBy,
        config.createdAt,
        config.updatedAt,
      );
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to update configuration",
      );
    }

    return response;
  }

  public async queryAuditLogs(
    request: RequestModel<{ serviceName: string; limit?: number }>,
  ): Promise<ResponseModel<MicroServiceAuditEntry[]>> {
    const response = new ResponseModel<MicroServiceAuditEntry[]>(
      request.transactionId,
    );
    if (!request.data?.serviceName) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name is required",
      );
    }
    const { serviceName, limit = 50 } = request.data;

    try {
      const logs = await MicroServiceAuditLogModel.findAll({
        where: { serviceName },
        order: [["created_at", "DESC"]],
        limit,
      });

      response.data = logs.map(
        (l) =>
          new MicroServiceAuditEntry(
            l.id,
            l.serviceName,
            l.actionType,
            l.details,
            l.performedBy,
            l.createdAt,
          ),
      );
      response.totalCount = logs.length;
    } catch (error) {
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Failed to query audit logs",
      );
    }

    return response;
  }

  private async calculateUptimeSummary(
    serviceName: string,
    days: number = 30,
  ): Promise<MicroServiceUptimeSummary> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const logs = await MicroServiceHealthLogModel.findAll({
      where: {
        serviceName,
        checkedAt: { [Op.gte]: sinceDate },
      },
      order: [["checked_at", "ASC"]],
    });

    if (logs.length === 0) {
      return {
        serviceName,
        currentStatus: "UP",
        uptime24hPercentage: 100,
        uptime30dPercentage: 100,
        averageResponseTimeMs: 0,
        history: [],
      };
    }

    const upLogs = logs.filter((l) => l.status === "UP");
    const uptime30d = Number(((upLogs.length / logs.length) * 100).toFixed(2));

    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    const recentLogs = logs.filter((l) => new Date(l.checkedAt) >= dayAgo);
    const recentUpLogs = recentLogs.filter((l) => l.status === "UP");
    const uptime24h =
      recentLogs.length > 0
        ? Number(((recentUpLogs.length / recentLogs.length) * 100).toFixed(2))
        : 100;

    const totalResponseTime = logs.reduce(
      (acc, l) => acc + l.responseTimeMs,
      0,
    );
    const avgLatency = Math.round(totalResponseTime / logs.length);

    // Group logs into 30 slots for the UI bar
    const slotsCount = 30;
    const history: UptimeHistorySlot[] = [];
    const stepMs = (Date.now() - sinceDate.getTime()) / slotsCount;

    for (let i = 0; i < slotsCount; i++) {
      const slotStart = new Date(sinceDate.getTime() + i * stepMs);
      const slotEnd = new Date(sinceDate.getTime() + (i + 1) * stepMs);
      const slotLogs = logs.filter(
        (l) =>
          new Date(l.checkedAt) >= slotStart && new Date(l.checkedAt) < slotEnd,
      );

      if (slotLogs.length === 0) {
        history.push({
          timestamp: slotStart,
          status: "UP",
          responseTimeMs: 0,
          uptimePercentage: 100,
        });
      } else {
        const slotUp = slotLogs.filter((l) => l.status === "UP");
        const slotAvgLatency = Math.round(
          slotLogs.reduce((acc, l) => acc + l.responseTimeMs, 0) /
            slotLogs.length,
        );
        const slotStatus: HealthStatus =
          slotUp.length === slotLogs.length
            ? "UP"
            : slotUp.length > 0
              ? "DEGRADED"
              : "DOWN";

        history.push({
          timestamp: slotStart,
          status: slotStatus,
          responseTimeMs: slotAvgLatency,
          uptimePercentage: Number(
            ((slotUp.length / slotLogs.length) * 100).toFixed(1),
          ),
        });
      }
    }

    return {
      serviceName,
      currentStatus: logs[logs.length - 1]?.status ?? "UP",
      uptime24hPercentage: uptime24h,
      uptime30dPercentage: uptime30d,
      averageResponseTimeMs: avgLatency,
      history,
    };
  }
}
