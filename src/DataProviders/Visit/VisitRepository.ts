import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "@src/Domain/Visit/Entity/Visit";
import logger from "jet-logger";
import { BaseRepository } from "../BaseRepository";
import { VisitModel } from "./Visit";

export class VisitRepositoryImpl extends BaseRepository {
  async registerVisit(
    request: RequestModel<Visit>
  ): Promise<ResponseModel<Visit>> {
    const response = new ResponseModel<Visit>(request.transactionId);

    try {
      const { data } = request;

      const newVisit = await VisitModel.create({
        pageId: data!.pageId!,
        userId: data!.userId!,
        countryCode: data!.countryCode || undefined,
      });

      response.data = new Visit(newVisit.pageId, newVisit.userId);
    } catch (error) {
      logger.err("Error in registerVisit:");
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

export const VisitRepositoryInstance = new VisitRepositoryImpl();
