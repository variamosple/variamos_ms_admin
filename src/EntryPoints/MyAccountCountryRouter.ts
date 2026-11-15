import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import type { AccountCountryUseCase } from "#src/Domain/User/UseCase/AccountCountryUseCase.js";
import { AUTH_ROUTE } from "./AuthRouter.js";
import { signedInUser } from "./actor.js";
import { defaultCountryBody } from "./authRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { readBody } from "./requestBody.js";

export const MY_ACCOUNT_COUNTRY_ROUTE = `${AUTH_ROUTE}/my-account/default-country`;

/**
 * The country by default of the signed-in account (EV-90): saved only when
 * the account has none. Same permission as the rest of "My account", which
 * a guest does not have.
 */
export function createMyAccountCountryRouter(
  useCase: AccountCountryUseCase,
): Router {
  const router = Router();

  router.put("/", hasPermissions(["my-account::update"]), async (req, res) => {
    const transactionId = "setMyAccountDefaultCountry";
    const body = readBody(defaultCountryBody, req, res, transactionId);
    if (!body) return;
    try {
      const response = await useCase.setDefault(
        transactionId,
        signedInUser(req).id,
        body.countryCode,
      );
      res.status(mapDomainErrorToHttpStatus(response.errorCode)).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });

  return router;
}
