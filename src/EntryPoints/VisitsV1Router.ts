import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Visit } from "#src/Domain/Visit/Entity/Visit.js";
import type { VisitUseCase } from "#src/Domain/Visit/UseCase/VisitUseCase.js";
import { visitBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { visitLimiter } from "./RateLimits.js";
import { checkedBody, validBody } from "./requestBody.js";

export const VISITS_V1_ROUTE = "/v1/visits";

export function createVisitsRouter(visitUseCase: VisitUseCase): Router {
  const visitsV1Router = Router();

  visitsV1Router.post(
    "/",
    isAuthenticated,
    visitLimiter(),
    validBody(visitBody, "createVisit"),
    async (req, res) => {
      const transactionId = "createVisit";
      const user = req.user;
      const { pageId } = checkedBody(visitBody, req);
      // The address nginx saw (trust proxy in server.ts), never the raw
      // X-Forwarded-For header, which the client writes (ADM-N26)
      const ipAddress = req.ip;

      try {
        if (!pageId || !user?.id) {
          res
            .status(HttpStatusCodes.BAD_REQUEST)
            .json(
              new ResponseModel<void>(transactionId).withError(
                DomainErrorCodes.INVALID_INPUT,
                "pageId and userId are required.",
              ),
            );
          return;
        }

        const permission: Visit = new Visit(pageId, user.id);

        const request = new RequestModel<Visit>(transactionId, permission);
        const response = await visitUseCase.registerVisit(request, ipAddress);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return visitsV1Router;
}
