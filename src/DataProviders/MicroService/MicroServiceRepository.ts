import Docker from "dockerode";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
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
import {
  buildUptimeSummary,
  uptimeWindow,
} from "#src/Domain/MicroService/Service/UptimeSummary.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import type { IContainerResources } from "./ContainerResourceSampler.js";
import {
  belongsTo,
  containerInfoOf,
  serviceDefinitionOf,
} from "./dockerContainers.js";
import { HealthLogStatistics } from "./HealthLogStatistics.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";
import { RecentResults } from "./RecentResults.js";

/**
 * Age at which an uptime summary is computed again. A service is checked
 * every 30 s by default, so a summary younger than that misses at most one
 * check per service. Measured on 2026-11-02 (EV-92): one computation reads 30
 * days of checks, 842 ms of PostgreSQL for eight services; computed at each
 * opening of the screen, it saturated the database from 50 sessions on.
 */
const UPTIME_MAX_AGE_MS = 30_000;

/** Shown on the screen instead of an empty list. */
export const DOCKER_UNREACHABLE_MESSAGE =
  "The services cannot be listed: Docker does not answer. Their health checks go on.";

/** The monitored services, read from Docker, and their health checks. */
export class MicroServiceRepositoryImpl implements IMicroServiceRepository {
  private dockerConnection: Docker;
  private readonly statistics: HealthLogStatistics;
  private readonly recentUptimes: RecentResults<MicroServiceUptimeSummary[]>;
  private readonly resources: IContainerResources | undefined;
  /** The services of the last listing that worked, for a Docker outage. */
  private lastDefinitions: ServiceDefinition[] = [];

  public constructor(config: {
    docker: Docker.DockerOptions;
    statistics?: HealthLogStatistics;
    uptimeMaxAgeMs?: number;
    /** CPU and memory of the running containers (EV-86 lot 2). */
    resources?: IContainerResources;
  }) {
    this.resources = config.resources;
    this.dockerConnection = new Docker(config.docker);
    this.statistics =
      config.statistics ?? new HealthLogStatistics(VARIAMOS_ORM, DB_SCHEMA);
    this.recentUptimes = new RecentResults(
      config.uptimeMaxAgeMs ?? UPTIME_MAX_AGE_MS,
    );
  }

  /**
   * Discover service definitions dynamically from Docker containers using labels
   * or compose metadata. A caller that already listed the containers passes
   * them: Docker is then not asked twice.
   */
  public async discoverServiceDefinitions(
    listedContainers?: Docker.ContainerInfo[],
  ): Promise<ServiceDefinition[]> {
    const containers = listedContainers ?? (await this.listContainersOrNull());
    // The health checks go on for the services known: a proxy that stops
    // answering does not stop the measures (EV-71)
    if (!containers) return this.lastDefinitions;
    try {
      const discoveredMap = new Map<string, ServiceDefinition>();

      // The first container of a service gives its definition
      for (const c of containers) {
        const def = serviceDefinitionOf(c);
        if (def && !discoveredMap.has(def.name)) {
          discoveredMap.set(def.name, def);
        }
      }

      const definitions = Array.from(discoveredMap.values());
      // A recreated container gets another address, maybe one of another
      // service: the copy kept for a Docker outage holds none
      this.lastDefinitions = definitions.map((def) => ({
        ...def,
        containerIps: [],
      }));
      return definitions;
    } catch (err) {
      logger.warn(
        `Failed to dynamically discover service definitions: ${errorMessage(err)}`,
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
      const containers = await this.listContainersOrNull();
      if (!containers) {
        return response.withError(
          DomainErrorCodes.UNAVAILABLE,
          DOCKER_UNREACHABLE_MESSAGE,
        );
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

      // One query for the uptime of every listed service
      const uptimeSummaries = new Map(
        (
          await this.uptimeSummaries(
            discoveredDefs.map((def) => def.name),
          ).catch((err) => {
            logger.warn(
              `Could not calculate uptime summaries: ${errorMessage(err)}`,
            );
            return [];
          })
        ).map((summary) => [summary.serviceName, summary]),
      );

      const services = await Promise.all(
        discoveredDefs.map(async (def) => {
          const containerInfos = this.containerInfosOf(containers, def);

          const latestHealthLog = await MicroServiceHealthLogModel.findOne({
            where: { serviceName: def.name },
            order: [["checked_at", "DESC"]],
          }).catch((err) => {
            logger.warn(
              `Could not query latest health log: ${errorMessage(err)}`,
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

          return new MicroServiceDetailed({
            serviceName: def.name,
            displayName: def.displayName,
            health: healthInfo,
            replicasCount: containerInfos.length || (status === "UP" ? 1 : 0),
            containers: containerInfos,
            uptimeSummary,
            targetUrl: def.targetUrl,
          });
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
      const containers = await this.listContainersOrNull();
      if (!containers) {
        return response.withError(
          DomainErrorCodes.UNAVAILABLE,
          DOCKER_UNREACHABLE_MESSAGE,
        );
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

      // Same matching and fields as the list
      const containerInfos = this.containerInfosOf(containers, def);

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

      response.data = new MicroServiceDetailed({
        serviceName: def.name,
        displayName: def.displayName,
        health: healthInfo,
        replicasCount: containerInfos.length || (status === "UP" ? 1 : 0),
        containers: containerInfos,
        uptimeSummary,
        targetUrl: def.targetUrl,
      });
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
            ? (healthInfo.errorMessage ?? "Service unreachable or unhealthy")
            : undefined,
      });
    } catch (error) {
      logger.err(
        `Failed to record health check for ${healthInfo.serviceName}: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Uptime of the services over the last `days` days, computed by PostgreSQL
   * and kept UPTIME_MAX_AGE_MS: every screen open in that time reads the same
   * computation (EV-92).
   */
  private containerInfosOf(
    containers: Docker.ContainerInfo[],
    def: ServiceDefinition,
  ): ContainerInstanceInfo[] {
    const resourcesOf = (id: string) => this.resources?.resourcesOf(id);
    return containers
      .filter((c) => belongsTo(c, def))
      .map((c) => containerInfoOf(c, resourcesOf));
  }

  /** The containers, or null when Docker does not answer. */
  private async listContainersOrNull(): Promise<Docker.ContainerInfo[] | null> {
    try {
      return await this.dockerConnection.listContainers({ all: true });
    } catch (err) {
      logger.warn(`Docker unreachable: ${errorMessage(err)}`);
      return null;
    }
  }

  private uptimeSummaries(
    serviceNames: string[],
    days = 30,
  ): Promise<MicroServiceUptimeSummary[]> {
    return this.recentUptimes.get(`${days}:${serviceNames.join(",")}`, () =>
      this.computeUptimeSummaries(serviceNames, days),
    );
  }

  private async computeUptimeSummaries(
    serviceNames: string[],
    days: number,
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
