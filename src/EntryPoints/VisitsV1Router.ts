import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "@src/Domain/Visit/Entity/Visit";
import { VisitsUseCases } from "@src/Domain/Visit/VisitUseCases";
import { VisitRepositoryInstance } from "@src/DataProviders/Visit/VisitRepository";
import { CountriesRepositoryInstance } from "@src/DataProviders/Countries/CountriesRepository";
import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

export const VISITS_V1_ROUTE = "/v1/visits";

const visitsV1Router = Router();

visitsV1Router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createVisit";
  const user = req.user;
  const { pageId } = req.body as { pageId?: string };
  const ipAddress: string | undefined = (req.headers["x-forwarded-for"] as string) || req.ip;

  try {
    if (!pageId || !user || !user.id) {
      return res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.INVALID_INPUT,
            "pageId and userId are required.",
          ),
        );
    }

    const permission: Visit = new Visit(pageId, user.id);

    const request = new RequestModel<Visit>(transactionId, permission);
    const response = await new VisitsUseCases(
      VisitRepositoryInstance,
      CountriesRepositoryInstance,
    ).registerVisit(request, ipAddress);

    const status = mapDomainErrorToHttpStatus(response.errorCode);
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      DomainErrorCodes.SYSTEM_ERROR,
      "Internal Server Error",
    );
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
  }
});

export default visitsV1Router;
