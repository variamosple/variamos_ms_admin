import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { MicroServiceRepositoryInstance } from "@src/DataProviders/MicroService/MicroServiceRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { MicroService } from "./Entity/MicroService";
import { MicroServiceFilter } from "./Entity/MicroServiceFilter";

export class MicroServiceUseCases {
  queryMicroServices(
    request: RequestModel<MicroServiceFilter>
  ): Promise<ResponseModel<MicroService[]>> {
    return MicroServiceRepositoryInstance.queryMicroServices(request);
  }

  async startMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService Id is required."
      );
    }

    const microserviceResponse = await MicroServiceRepositoryInstance.queryById(
      request
    );

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message!
      );
    }

    if (microserviceResponse.data?.getState() !== "exited") {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService is not in exited state."
      );
    }

    return MicroServiceRepositoryInstance.startMicroService(request);
  }

  async stopMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService Id is required."
      );
    }

    const microserviceResponse = await MicroServiceRepositoryInstance.queryById(
      request
    );

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message!
      );
    }

    if (microserviceResponse.data?.getState() !== "running") {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService is not in running state."
      );
    }

    return MicroServiceRepositoryInstance.stopMicroService(request);
  }

  async restartMicroService(
    request: RequestModel<string>
  ): Promise<ResponseModel<void>> {
    const defaultResponse = new ResponseModel<void>(request.transactionId);
    if (!request.data) {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService Id is required."
      );
    }

    const microserviceResponse = await MicroServiceRepositoryInstance.queryById(
      request
    );

    if (microserviceResponse.errorCode) {
      return defaultResponse.withError(
        microserviceResponse.errorCode,
        microserviceResponse.message!
      );
    }

    if (microserviceResponse.data?.getState() !== "running") {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService is not in running state."
      );
    }

    return MicroServiceRepositoryInstance.restartMicroService(request);
  }

  async watchMicroServiceLogs(
    request: RequestModel<string>
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const defaultResponse = new ResponseModel<NodeJS.ReadableStream>(
      request.transactionId
    );

    if (!request.data) {
      return defaultResponse.withError(
        HttpStatusCodes.BAD_REQUEST,
        "MicroService Id is required."
      );
    }

    return MicroServiceRepositoryInstance.watchMicroServiceLogs(request);
  }
}
