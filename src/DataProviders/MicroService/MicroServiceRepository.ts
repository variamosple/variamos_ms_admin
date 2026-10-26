import Docker from "dockerode";
import logger from "jet-logger";
import { Op } from "sequelize";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";
import { MicroServiceAuditEntry } from "#src/Domain/MicroService/Entity/MicroServiceAuditEntry.js";
import { MicroServiceConfigItem } from "#src/Domain/MicroService/Entity/MicroServiceConfigItem.js";
import {
  type ContainerInstanceInfo,
  MicroServiceDetailed,
} from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { MicroServiceFilter } from "#src/Domain/MicroService/Entity/MicroServiceFilter.js";
import {
  type MicroServiceHealthInfo,
  type MicroServiceStatusInfo,
  type MicroServiceUptimeSummary,
  resolveServiceStatus,
} from "#src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { ServiceDefinition } from "#src/Domain/MicroService/Entity/ServiceDefinition.js";
import type { IMicroServiceRepository } from "#src/Domain/MicroService/Repository/IMicroServiceRepository.js";
import { refuseConfigurationUpdate } from "#src/Domain/MicroService/Service/ConfigurationUpdateRule.js";
import {
  buildUptimeSummary,
  uptimeWindow,
} from "#src/Domain/MicroService/Service/UptimeSummary.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import {
  ConfigurationModel,
  type ConfigurationValue,
} from "../Configuration/Configuration.js";
import type { SecretConfigurationValue } from "../Configuration/SecretConfigurationValue.js";
import { HealthLogStatistics } from "./HealthLogStatistics.js";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";

/**
 * IP addresses of a container on every Docker network it is attached to.
 * Probing these avoids DNS lookups, which stall for seconds on unknown names.
 */
export function containerIpsOf(container: {
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
}): string[] {
  return Object.values(container.NetworkSettings?.Networks ?? {})
    .map((network) => network.IPAddress)
    .filter((ip): ip is string => Boolean(ip));
}

/**
 * A container is a monitored microservice only when it carries the explicit
 * `variamos.service.monitored=true` label.
 */
export function isMonitoredContainer(labels: Record<string, string>): boolean {
  return labels["variamos.service.monitored"] === "true";
}

export class MicroServiceRepositoryImpl implements IMicroServiceRepository {
  private dockerConnection: Docker;
  private healthCollector?: {
    triggerHealthChecks: (
      serviceName?: string,
    ) => Promise<MicroServiceHealthInfo[]>;
  };

  private readonly secrets: SecretConfigurationValue;
  private readonly statistics: HealthLogStatistics;

  public constructor(config: {
    socketPath: string;
    secrets: SecretConfigurationValue;
    statistics?: HealthLogStatistics;
  }) {
    this.dockerConnection = new Docker({
      socketPath: config.socketPath,
    });
    this.secrets = config.secrets;
    this.statistics =
      config.statistics ?? new HealthLogStatistics(VARIAMOS_ORM, DB_SCHEMA);
  }

  /** The value as text, in clear; the mask when a secret cannot be decrypted. */
  private displayedValueOf(config: ConfigurationModel): string {
    const value = config.isSecret
      ? (this.secrets.decrypt(config.key, config.value) ?? SECRET_MASK)
      : config.value;
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  public setHealthCollector(collector: {
    triggerHealthChecks: (
      serviceName?: string,
    ) => Promise<MicroServiceHealthInfo[]>;
  }): void {
    this.healthCollector = collector;
  }

  public async triggerHealthChecks(
    serviceName?: string,
  ): Promise<MicroServiceHealthInfo[]> {
    if (this.healthCollector) {
      return this.healthCollector.triggerHealthChecks(serviceName);
    }
    return [];
  }

  /**
   * Discover service definitions dynamically from Docker containers using labels
   * or compose metadata. A caller that already listed the containers passes
   * them: Docker is then not asked twice.
   */
  public async discoverServiceDefinitions(
    listedContainers?: Docker.ContainerInfo[],
  ): Promise<ServiceDefinition[]> {
    try {
      const containers =
        listedContainers ??
        (await this.dockerConnection.listContainers({
          all: true,
        }));
      const discoveredMap = new Map<string, ServiceDefinition>();

      for (const c of containers) {
        const labels = c.Labels || {};
        const composeService = labels["com.docker.compose.service"];

        // Only containers that explicitly opt in are monitored. Matching on
        // compose service names also picked up front-end containers and duplicate deployments.
        if (!isMonitoredContainer(labels)) {
          continue;
        }

        const rawServiceName =
          labels["variamos.service.name"] ||
          composeService?.replace(/-/g, "_") ||
          c.Names[0]
            ?.replace(/^\//, "")
            .replace(/-test$/, "")
            .replace(/-/g, "_");

        if (!rawServiceName || discoveredMap.has(rawServiceName)) {
          continue;
        }

        const rawDisplayName =
          labels["variamos.service.display-name"] ||
          rawServiceName
            .split("_")
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(" ");

        const internalPort = labels["variamos.service.internal-port"]
          ? parseInt(labels["variamos.service.internal-port"], 10)
          : c.Ports?.[0]?.PrivatePort || 4000;

        const healthPath = labels["variamos.service.health-path"] || "/health";

        // Determine targetUrl: if host port is published use localhost, else use internal container alias
        const hostPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort;
        const targetUrl = hostPort
          ? `http://localhost:${hostPort}`
          : `http://${composeService || rawServiceName}:${internalPort}`;

        discoveredMap.set(rawServiceName, {
          name: rawServiceName,
          displayName: rawDisplayName,
          targetUrl,
          containerNamePattern:
            composeService || rawServiceName.replace(/_/g, "-"),
          containerIps: containerIpsOf(c),
          defaultPort: internalPort,
          healthPath,
        });
      }

      return Array.from(discoveredMap.values());
    } catch (err) {
      logger.warn(
        `Failed to dynamically discover service definitions: ${(err as Error).message}`,
      );
      return [];
    }
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

      const nameFilter = filter?.name?.toLowerCase();
      const discoveredDefs = (
        await this.discoverServiceDefinitions(containers)
      ).filter(
        (def) =>
          !nameFilter ||
          def.displayName.toLowerCase().includes(nameFilter) ||
          def.name.toLowerCase().includes(nameFilter),
      );
      const matchedContainerIds = new Set<string>();

      // One query for the uptime of every listed service
      const uptimeSummaries = new Map(
        (
          await this.uptimeSummaries(
            discoveredDefs.map((def) => def.name),
          ).catch((err) => {
            logger.warn(
              `Could not calculate uptime summaries: ${(err as Error).message}`,
            );
            return [];
          })
        ).map((summary) => [summary.serviceName, summary]),
      );

      const services = await Promise.all(
        discoveredDefs.map(async (def) => {
          // Match containers belonging to this service by label, compose name or pattern
          const matchedContainers = containers.filter((c) => {
            const labels = c.Labels || {};
            if (labels["variamos.service.name"] === def.name) return true;
            if (
              labels["com.docker.compose.service"] === def.containerNamePattern
            )
              return true;
            return c.Names.some((n) => {
              const cleanN = n.replace(/^\//, "").toLowerCase();
              return (
                cleanN === def.name.toLowerCase() ||
                cleanN.includes(def.name.toLowerCase().replace(/_/g, "-")) ||
                (def.containerNamePattern &&
                  cleanN.includes(def.containerNamePattern.toLowerCase()))
              );
            });
          });

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

          const latestHealthLog = await MicroServiceHealthLogModel.findOne({
            where: { serviceName: def.name },
            order: [["checked_at", "DESC"]],
          }).catch((err) => {
            logger.warn(
              `Could not query latest health log: ${(err as Error).message}`,
            );
            return null;
          });
          const uptimeSummary = uptimeSummaries.get(def.name);

          const status = resolveServiceStatus(
            containerInfos,
            latestHealthLog?.status,
          );

          // Without a persisted health log there is no measurement: leave the
          // fields undefined instead of showing a fabricated 0 ms.
          const healthInfo: MicroServiceStatusInfo = {
            status,
            serviceName: def.name,
            responseTimeMs: latestHealthLog?.responseTimeMs,
            checkedAt: latestHealthLog?.checkedAt,
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
      let containers: Docker.ContainerInfo[] = [];
      try {
        containers = await this.dockerConnection.listContainers({ all: true });
      } catch (err) {
        logger.warn(`Docker connection warning: ${(err as Error).message}`);
      }

      const discoveredDefs = await this.discoverServiceDefinitions(containers);
      const def = discoveredDefs.find(
        (s) =>
          s.name.toLowerCase() === serviceName?.toLowerCase() ||
          s.displayName.toLowerCase() === serviceName?.toLowerCase(),
      );

      if (!def) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          `Service ${serviceName} not found`,
        );
      }

      const matchedContainers = containers.filter((c) => {
        const labels = c.Labels || {};
        if (labels["variamos.service.name"] === def.name) return true;
        if (labels["com.docker.compose.service"] === def.containerNamePattern)
          return true;
        return c.Names.some((n) => {
          const cleanN = n.replace(/^\//, "").toLowerCase();
          return (
            cleanN === def.name.toLowerCase() ||
            cleanN.includes(def.name.toLowerCase().replace(/_/g, "-")) ||
            (def.containerNamePattern &&
              cleanN.includes(def.containerNamePattern.toLowerCase()))
          );
        });
      });

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

      const status = resolveServiceStatus(
        containerInfos,
        latestHealthLog?.status,
      );

      // As in the list: no fabricated time or date without a measurement
      const healthInfo: MicroServiceStatusInfo = {
        status,
        serviceName: def.name,
        responseTimeMs: latestHealthLog?.responseTimeMs,
        checkedAt: latestHealthLog?.checkedAt,
      };

      const [uptimeSummary] = await this.uptimeSummaries([def.name]);

      response.data = new MicroServiceDetailed(
        def.name,
        def.displayName,
        healthInfo,
        containerInfos.length || (status === "UP" ? 1 : 0),
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

  /**
   * Container targeted by an action or a log request: an exact container id,
   * service name or container name, among the containers that opt in to
   * monitoring only (EV-71). Prefixes and partial names are refused: a short
   * value could otherwise reach an unrelated container.
   */
  private async resolveContainer(
    idOrServiceName: string,
  ): Promise<Docker.Container | null> {
    try {
      const containers = (
        await this.dockerConnection.listContainers({ all: true })
      ).filter((c) => isMonitoredContainer(c.Labels || {}));
      const target = idOrServiceName.replace(/^\//, "").toLowerCase();
      const match = containers.find((c) => {
        const labels = c.Labels || {};
        const composeService =
          labels["com.docker.compose.service"]?.toLowerCase();
        return (
          c.Id === idOrServiceName ||
          labels["variamos.service.name"]?.toLowerCase() === target ||
          composeService === target ||
          composeService?.replace(/-/g, "_") === target ||
          c.Names.some((n) => n.replace(/^\//, "").toLowerCase() === target)
        );
      });
      if (match) {
        return this.dockerConnection.getContainer(match.Id);
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
    actorId: string,
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
        performedBy: actorId,
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
    actorId: string,
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
        performedBy: actorId,
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
    actorId: string,
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
        performedBy: actorId,
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
      [response.data] = await this.uptimeSummaries([serviceName], days);
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
        // The collector always measures a probe before recording it.
        responseTimeMs: healthInfo.responseTimeMs ?? 0,
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
      // Find configurations targeted to this specific service OR targeted to "all"
      const configs = await ConfigurationModel.findAll({
        where: {
          [Op.or]: [
            { targetServices: { [Op.contains]: [serviceName] } },
            { targetServices: { [Op.contains]: ["all"] } },
          ],
        },
        order: [["key", "ASC"]],
      });

      response.data = configs.map(
        (c) =>
          new MicroServiceConfigItem(
            c.id,
            serviceName,
            c.key,
            this.displayedValueOf(c),
            (c.type as "string" | "number" | "boolean" | "json") || "string",
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
      const existing = await ConfigurationModel.findOne({ where: { key } });
      const refusal = refuseConfigurationUpdate(key, value, existing);
      if (refusal) {
        return response.withError(refusal.errorCode, refusal.message);
      }

      let parsedValue: ConfigurationValue = value;
      let detectedType: "string" | "number" | "boolean" | "object" | "array" =
        "string";

      try {
        parsedValue = JSON.parse(value);
        if (typeof parsedValue === "number") detectedType = "number";
        else if (typeof parsedValue === "boolean") detectedType = "boolean";
        else if (Array.isArray(parsedValue)) detectedType = "array";
        else if (typeof parsedValue === "object" && parsedValue !== null)
          detectedType = "object";
        else parsedValue = value;
      } catch {
        parsedValue = value;
      }

      let config: ConfigurationModel;

      if (existing) {
        // A secret is never written in clear (T-13)
        if (existing.isSecret && !this.secrets.canEncrypt()) {
          return response.withError(
            DomainErrorCodes.UNAVAILABLE,
            "Secret configurations cannot be changed: no encryption key is configured.",
          );
        }
        const targetServices = Array.from(
          new Set([...existing.targetServices, serviceName]),
        );
        await existing.update({
          value: existing.isSecret
            ? this.secrets.encrypt(key, parsedValue)
            : parsedValue,
          targetServices,
          updatedBy: operatorId,
        });
        config = existing;
      } else {
        config = await ConfigurationModel.create({
          key,
          value: parsedValue,
          type: detectedType,
          category: "env",
          requiresMfa: false,
          isSecret: false,
          environmentScope: "all",
          isReadOnly: false,
          targetServices: [serviceName],
          updatedBy: operatorId,
        });
      }

      await MicroServiceAuditLogModel.create({
        serviceName,
        actionType: "CONFIG_UPDATE",
        // A secret value is never written to the audit log
        details: { key, newValue: existing?.isSecret ? SECRET_MASK : value },
        performedBy: operatorId,
      });

      response.data = new MicroServiceConfigItem(
        config.id,
        serviceName,
        config.key,
        this.displayedValueOf(config),
        (config.type as "string" | "number" | "boolean" | "json") || "string",
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
      // Older entries stored secret values in clear: mask them on the way out
      const secretConfigs = await ConfigurationModel.findAll({
        where: { isSecret: true },
        attributes: ["key"],
      });
      const secretKeys = new Set(secretConfigs.map((c) => c.key));

      response.data = logs.map((l) =>
        new MicroServiceAuditEntry(
          l.id,
          l.serviceName,
          l.actionType,
          l.details,
          l.performedBy,
          l.createdAt,
        ).withSecretsMasked(secretKeys),
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

  /** Uptime of the services over the last `days` days, computed by PostgreSQL. */
  private async uptimeSummaries(
    serviceNames: string[],
    days = 30,
  ): Promise<MicroServiceUptimeSummary[]> {
    const window = uptimeWindow(days);
    const [counts, lastStatuses] = await Promise.all([
      this.statistics.uptimeCounts(serviceNames, window),
      this.statistics.lastStatuses(serviceNames, window.since),
    ]);
    return serviceNames.map((name) =>
      buildUptimeSummary(
        name,
        counts.get(name) ?? [],
        lastStatuses.get(name),
        window,
      ),
    );
  }
}
