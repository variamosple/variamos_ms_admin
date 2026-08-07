import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { CountriesQueryUseCase } from "@src/Domain/Countries/UseCase/CountriesQueryUseCase.js";

import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

export const COUNTRIES_V1_ROUTE = "/v1/countries";

export function createCountriesRouter(
  countriesQueryUseCase: CountriesQueryUseCase,
): Router {
  const countriesV1Router = Router();

  countriesV1Router.get("/", isAuthenticated, async (_, res) => {
    const transactionId = "getCountries";

    try {
      const request = new RequestModel<void>(transactionId);
      const response = await countriesQueryUseCase.getCountries(request);

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

  return countriesV1Router;
}
