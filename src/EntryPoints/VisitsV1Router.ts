import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "@src/Domain/Visit/Entity/Visit";
import { VisitsUseCases } from "@src/Domain/Visit/VisitUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const VISITS_V1_ROUTE = "/v1/visits";

const visitsV1Router = Router();

visitsV1Router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createVisit";
  const user = req.user!;
  const { pageId } = req.body;
  const ipAddress: string | undefined =
    (req.headers["x-forwarded-for"] as string) || req.ip;

  console.log("ipAddress", ipAddress);

  try {
    if (!pageId || !user.id) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "pageId and userId are required."
          )
        );
    }

    const permission: Visit = new Visit(pageId, user.id);

    const request = new RequestModel<Visit>(transactionId, permission);
    const response = await new VisitsUseCases().registerVisit(
      request,
      "191.91.238.0"
    );

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

export default visitsV1Router;
