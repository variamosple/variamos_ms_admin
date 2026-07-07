import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "@src/Domain/Visit/Entity/Visit";
import logger from "jet-logger";
import { BaseRepository } from "../BaseRepository";
import { VisitModel } from "./Visit";
import { IVisitRepository } from "@src/Domain/Visit/Repository/IVisitRepository"; // wait, check if IVsitRepository has typo in original import

export class VisitRepositoryImpl extends BaseRepository implements IVisitRepository {
  public async registerVisit(request: RequestModel<Visit>): Promise<ResponseModel<Visit>> {
    const response = new ResponseModel<Visit>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        response.withError(DomainErrorCodes.BAD_REQUEST, "Visit data is required");
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
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }
}

export const VisitRepositoryInstance = new VisitRepositoryImpl();
