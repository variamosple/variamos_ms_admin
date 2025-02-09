import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { CountriesUseCases } from "@src/Domain/Countries/CountriesUseCases";

import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const COUNTRIES_V1_ROUTE = "/v1/countries";

const countriesV1Router = Router();

countriesV1Router.get("/", isAuthenticated, async (_, res) => {
  const transactionId = "getCountries";

  try {
    const request = new RequestModel<unknown>(transactionId);
    const response = await new CountriesUseCases().getCountries(request);

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

export default countriesV1Router;
