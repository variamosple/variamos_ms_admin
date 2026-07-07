import EnvVars from "@src/common/EnvVars";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "@src/Domain/MicroService/Entity/MicroService";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter";

import Docker from "dockerode";
import logger from "jet-logger";

import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";

export class MicroServiceRepositoryImpl implements IMicroServiceRepository {
  private dockerConnection: Docker;

  public constructor() {
    this.dockerConnection = new Docker({
      socketPath: EnvVars.DOCKER.SOCKET_PATH,
    });
  }

  public async queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>> {
    const response = new ResponseModel<MicroService[]>(request.transactionId);

    try {
      const { data: filter = new MicroServiceFilter() } = request;

      const containers = await this.dockerConnection
        .listContainers({
          all: true,
        })
        .then((response) =>
          response.filter(
            (container) =>
              !filter.name ||
              container.Names.findIndex((name) =>
                name.toLowerCase().includes(filter.name ? filter.name.toLowerCase() : ""),
              ) !== -1,
          ),
        );

      const pageNumber = filter.pageNumber ?? 1;
      const pageSize = filter.pageSize ?? 10;
      const offset = (pageNumber - 1) * pageSize;
      const limit = Math.min(offset + pageSize, containers.length);

      response.totalCount = containers.length;

      if (offset >= containers.length) {
        response.data = [];
        return response;
      }

      response.data = containers.slice(offset, limit).map((container) =>
        MicroService.builder()
          .setId(container.Id)
          .setNames(container.Names)
          .setCreated(new Date(container.Created * 1000))
          .setLabels(container.Labels)
          .setState(container.State)
          .setStatus(container.Status)
          .build(),
      );
    } catch (error) {
      logger.err("Error in queryMicroServices:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async queryById(request: RequestModel<string>): Promise<ResponseModel<MicroService>> {
    const response = new ResponseModel<MicroService>(request.transactionId);

    try {
      const { data: id } = request;

      if (!id) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Microservice ID is required");
        return response;
      }

      const container = this.dockerConnection.getContainer(id);
      const containerInfo = await container.inspect();

      if (!!container) {
        response.data = MicroService.builder()
          .setId(container.id)
          .setNames([containerInfo.Name])
          .setCreated(new Date(containerInfo.Created))
          .setLabels(containerInfo.Config.Labels)
          .setState(containerInfo.State.Status)
          .build();
      }
    } catch (error) {
      logger.err("Error in queryMicroServiceById:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async startMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      if (!id) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Microservice ID is required");
        return response;
      }

      const container = this.dockerConnection.getContainer(id);
      await container.start();
    } catch (error) {
      logger.err("Error in startMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async stopMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      if (!id) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Microservice ID is required");
        return response;
      }

      const container = this.dockerConnection.getContainer(id);
      await container.stop();
    } catch (error) {
      logger.err("Error in stopMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async restartMicroService(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      if (!id) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Microservice ID is required");
        return response;
      }

      const container = this.dockerConnection.getContainer(id);
      await container.restart();
    } catch (error) {
      logger.err("Error in restartMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const response = new ResponseModel<NodeJS.ReadableStream>(request.transactionId);

    try {
      const { data: id } = request;

      if (!id) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Microservice ID is required");
        return response;
      }

      const container = this.dockerConnection.getContainer(id);

      response.data = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
        timestamps: true,
      });
    } catch (error) {
      logger.err("Error in watchMicroServiceLogs:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }
}

export const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl();
