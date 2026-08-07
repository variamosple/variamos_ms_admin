import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { Visit } from "@src/Domain/Visit/Entity/Visit.js";
import type { IVisitRepository } from "@src/Domain/Visit/Repository/IVisitRepository.js"; // wait, check if IVsitRepository has typo in original import
import logger from "jet-logger";
import { BaseRepository } from "../BaseRepository.js";
import { VisitModel } from "./Visit.js";

export class VisitRepositoryImpl
  extends BaseRepository
  implements IVisitRepository
{
  public async registerVisit(
    request: RequestModel<Visit>,
  ): Promise<ResponseModel<Visit>> {
    const response = new ResponseModel<Visit>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Visit data is required",
        );
        return response;
      }

      const newVisit = await VisitModel.create({
        pageId: data.pageId,
        userId: data.userId,
        countryCode: data.countryCode || undefined,
      });

      response.data = new Visit(newVisit.pageId, newVisit.userId);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in registerVisit:");
      logger.err(request);
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}

export const VisitRepositoryInstance = new VisitRepositoryImpl();
