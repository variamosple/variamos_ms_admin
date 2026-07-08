import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { CountriesUseCases } from "@src/Domain/Countries/CountriesUseCases";
import { CountriesRepositoryInstance } from "@src/DataProviders/Countries/CountriesRepository";

import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

export const COUNTRIES_V1_ROUTE = "/v1/countries";

const countriesV1Router = Router();

countriesV1Router.get("/", isAuthenticated, async (_, res) => {
  const transactionId = "getCountries";

  try {
    const request = new RequestModel<void>(transactionId);
    const response = await new CountriesUseCases(CountriesRepositoryInstance).getCountries(request);

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

export default countriesV1Router;
