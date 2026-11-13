import Docker from "dockerode";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import { MicroServiceAuditEntry } from "#src/Domain/MicroService/Entity/MicroServiceAuditEntry.js";
import type { MicroServiceHealthInfo } from "#src/Domain/MicroService/Entity/MicroServiceHealth.js";
import type { IMicroServiceControlRepository } from "#src/Domain/MicroService/Repository/IMicroServiceControlRepository.js";
import { ConfigurationModel } from "../Configuration/Configuration.js";
import { isMonitoredContainer } from "./dockerContainers.js";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";

/** Actions on the service containers, their logs, and the audit log of the actions. */
export class MicroServiceControlRepositoryImpl
  implements IMicroServiceControlRepository
{
  private dockerConnection: Docker;
  private healthCollector?: {
    triggerHealthChecks: (
      serviceName?: string,
    ) => Promise<MicroServiceHealthInfo[]>;
  };

  public constructor(config: { docker: Docker.DockerOptions }) {
    this.dockerConnection = new Docker(config.docker);
  }

  public setHealthCollector(collector: {
    triggerHealthChecks: (
      serviceName?: string,
    ) => Promise<MicroServiceHealthInfo[]>;
  }): void {
    this.healthCollector = collector;
  }

  public triggerHealthChecks(
    serviceName?: string,
  ): Promise<MicroServiceHealthInfo[]> {
    if (this.healthCollector) {
      return this.healthCollector.triggerHealthChecks(serviceName);
    }
    return Promise.resolve([]);
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
        `Could not resolve Docker container for ${idOrServiceName}: ${errorMessage(err)}`,
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

      // No health line here: whether the service came back is for the next
      // real check to say, never an UP written without a measurement (EV-86)
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
        logger.warn(`Could not log health DOWN: ${errorMessage(err)}`);
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

      // No health line here: whether the service came back is for the next
      // real check to say, never an UP written without a measurement (EV-86)
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
        order: [["createdAt", "DESC"]],
        limit,
      });
      // Older entries stored secret values in clear: mask them on the way out
      const secretConfigs = await ConfigurationModel.findAll({
        where: { isSecret: true },
        attributes: ["key"],
      });
      const secretKeys = new Set(secretConfigs.map((c) => c.key));

      response.data = logs.map((l) =>
        new MicroServiceAuditEntry({
          id: l.id,
          serviceName: l.serviceName,
          actionType: l.actionType,
          details: l.details,
          performedBy: l.performedBy,
          createdAt: l.createdAt,
        }).withSecretsMasked(secretKeys),
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
}
