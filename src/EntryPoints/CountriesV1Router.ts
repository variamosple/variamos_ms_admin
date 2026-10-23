import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { CountriesQueryUseCase } from "#src/Domain/Countries/UseCase/CountriesQueryUseCase.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";

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
      sendError(res, error, transactionId);
    }
  });

  return countriesV1Router;
}
