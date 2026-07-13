import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroService } from "@src/Domain/MicroService/Entity/MicroService";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter";
import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";

export class MicroServiceQueryUseCase {
  public constructor(private readonly microServiceRepository: IMicroServiceRepository) {}

  public queryMicroServices(
    request: RequestModel<MicroServiceFilter>,
  ): Promise<ResponseModel<MicroService[]>> {
    return this.microServiceRepository.queryMicroServices(request);
  }

  public async watchMicroServiceLogs(
    request: RequestModel<string>,
  ): Promise<ResponseModel<NodeJS.ReadableStream>> {
    const defaultResponse = new ResponseModel<NodeJS.ReadableStream>(request.transactionId);

    if (!request.data) {
      return defaultResponse.withError(
        DomainErrorCodes.INVALID_INPUT,
        "MicroService Id is required.",
      );
    }

    return this.microServiceRepository.watchMicroServiceLogs(request);
  }
}
