import EnvVars from "@src/common/EnvVars";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "@src/Domain/MicroService/Entity/MicroService";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter";

import Docker from "dockerode";
import logger from "jet-logger";

export class MicroServiceRepositoryImpl {
  private dockerConnection: Docker;

  constructor() {
    this.dockerConnection = new Docker({
      socketPath: EnvVars.DOCKER.SOCKET_PATH,
    });
  }

  async queryMicroServices(
    request: RequestModel<MicroServiceFilter>
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
                name.toLowerCase().includes(filter.name!.toLowerCase())
              ) !== -1
          )
        );

      const offset = (filter.pageNumber! - 1) * filter.pageSize!;
      const limit = Math.min(offset + filter.pageSize!, containers.length);

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
          .build()
      );
    } catch (error) {
      logger.err("Error in queryMicroServices:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async queryById(
    request: RequestModel<string>
  ): Promise<ResponseModel<MicroService>> {
    const response = new ResponseModel<MicroService>(request.transactionId);

    try {
      const { data: id } = request;

      const container = this.dockerConnection.getContainer(id!);
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
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async startMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      const container = this.dockerConnection.getContainer(id!);
      await container.start();
    } catch (error) {
      logger.err("Error in startMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async stopMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      const container = this.dockerConnection.getContainer(id!);
      await container.stop();
    } catch (error) {
      logger.err("Error in stopMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async restartMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      const container = this.dockerConnection.getContainer(id!);
      await container.restart();
    } catch (error) {
      logger.err("Error in restartMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async watchMicroServiceLogs(
    request: RequestModel<string>
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const response = new ResponseModel<NodeJS.ReadableStream>(
      request.transactionId
    );

    try {
      const { data: id } = request;

      const container = this.dockerConnection.getContainer(id!);

      response.data = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
        timestamps: true,
      });
    } catch (error) {
      logger.err("Error in restartMicroService:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }
}

export const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl();
