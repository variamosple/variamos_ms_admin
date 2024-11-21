import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter";

import { MicroServiceUseCases } from "@src/Domain/MicroService/MicroServiceCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const MICRO_SERVICES_V1_ROUTE = "/v1/micro-services";

const microServicesV1Router = Router();

microServicesV1Router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "queryMicroService";
  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter: MicroServiceFilter = MicroServiceFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<MicroServiceFilter>(transactionId, filter);
    const response = await new MicroServiceUseCases().queryMicroServices(
      request
    );

    const status = response.errorCode || HttpStatusCodes.OK;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
      "Internal Server Error"
    );
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
  }
});

microServicesV1Router.put(
  "/:microserviceId/start",
  isAuthenticated,
  async (req, res) => {
    const transactionId = "startMicroService";
    const { microserviceId = null } = req.params;

    try {
      const request = new RequestModel<string>(
        transactionId,
        microserviceId as string
      );
      const response = await new MicroServiceUseCases().startMicroService(
        request
      );

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

microServicesV1Router.put(
  "/:microserviceId/restart",
  isAuthenticated,
  async (req, res) => {
    const transactionId = "restartMicroService";
    const { microserviceId = null } = req.params;

    try {
      const request = new RequestModel<string>(
        transactionId,
        microserviceId as string
      );
      const response = await new MicroServiceUseCases().restartMicroService(
        request
      );

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

microServicesV1Router.put(
  "/:microserviceId/stop",
  isAuthenticated,
  async (req, res) => {
    const transactionId = "stopMicroService";
    const { microserviceId = null } = req.params;

    try {
      const request = new RequestModel<string>(
        transactionId,
        microserviceId as string
      );
      const response = await new MicroServiceUseCases().stopMicroService(
        request
      );

      const status = response.errorCode || HttpStatusCodes.OK;
      res.status(status).json(response);
    } catch (error) {
      logger.err(error);
      const response = new ResponseModel(
        transactionId,
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal Server Error"
      );
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
    }
  }
);

export default microServicesV1Router;
