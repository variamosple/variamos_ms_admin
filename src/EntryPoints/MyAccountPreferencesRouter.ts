import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, type Response, Router } from "express";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { UserPreferences } from "#src/Domain/User/Entity/UserPreferences.js";
import type { UserPreferencesUseCase } from "#src/Domain/User/UseCase/UserPreferencesUseCase.js";
import { AUTH_ROUTE } from "./AuthRouter.js";
import { signedInUser } from "./actor.js";
import { preferencesBody } from "./authRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { readBody } from "./requestBody.js";

export const MY_ACCOUNT_PREFERENCES_ROUTE = `${AUTH_ROUTE}/my-account/preferences`;

interface UserPreferencesDto {
  timeZone: string | null;
  updatedAt: string | null;
}

const send = (res: Response, response: ResponseModel<UserPreferences>) => {
  const answer = new ResponseModel<UserPreferencesDto>(response.transactionId, {
    errorCode: response.errorCode,
    message: response.message,
  });
  if (response.data) {
    answer.data = {
      timeZone: response.data.timeZone,
      updatedAt: response.data.updatedAt?.toISOString() ?? null,
    };
  }
  res.status(mapDomainErrorToHttpStatus(answer.errorCode)).json(answer);
};

const userIdOf = (req: Request) => signedInUser(req).id;

/**
 * The display preferences of the signed-in account (EV-115 lot C): its time
 * zone for now. Same permissions as the rest of "My account".
 */
export function createMyAccountPreferencesRouter(
  useCase: UserPreferencesUseCase,
): Router {
  const router = Router();

  router.get("/", hasPermissions(["my-account::query"]), async (req, res) => {
    const transactionId = "queryMyAccountPreferences";
    try {
      send(res, await useCase.get(transactionId, userIdOf(req)));
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });

  router.put("/", hasPermissions(["my-account::update"]), async (req, res) => {
    const transactionId = "updateMyAccountPreferences";
    const body = readBody(preferencesBody, req, res, transactionId);
    if (!body) return;
    try {
      send(
        res,
        await useCase.setTimeZone(transactionId, userIdOf(req), body.timeZone),
      );
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });

  return router;
}
