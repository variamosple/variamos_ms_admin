import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import type { MicroService } from "@src/Domain/MicroService/Entity/MicroService.js";
import type { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter.js";
import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";

export class MicroServiceQueryUseCase {
  public constructor(
    private readonly microServiceRepository: IMicroServiceRepository,
  ) {}

  public queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>> {
    return this.microServiceRepository.queryMicroServices(request);
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const defaultResponse = new ResponseModel<NodeJS.ReadableStream>(
      request.transactionId,
    );

    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    return this.microServiceRepository.watchMicroServiceLogs(request);
  }
}
