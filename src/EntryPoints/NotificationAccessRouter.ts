import type { SessionUser } from "@variamosple/variamos-security";
import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import logger from "jet-logger";
import { describeError } from "#src/common/describeError.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  INotificationAccessTokenIssuer,
  NotificationAccessToken,
} from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";

export const NOTIFICATION_ACCESS_V1_ROUTE = "/v1/notifications";

/**
 * Gives a signed-in user the short-lived token used to call the
 * notification service (ADR-0001). Any session may get a token for itself:
 * no permission is required.
 */
export function createNotificationAccessRouter(
  issuer: INotificationAccessTokenIssuer,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/access-token",
    authMiddleware,
    async (req: Request, res: Response) => {
      const transactionId = "issueNotificationAccessToken";
      res.setHeader("Cache-Control", "no-store");
      const userId = (req.user as SessionUser | undefined)?.id;
      if (!userId) {
        res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            new ResponseModel(transactionId).withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "A valid session is required.",
            ),
          );
        return;
      }
      try {
        const accessToken = await issuer.issue(String(userId));
        res
          .status(HttpStatusCodes.OK)
          .json(
            new ResponseModel<NotificationAccessToken>(
              transactionId,
            ).withResponse(accessToken),
          );
      } catch (error) {
        logger.err(describeError(error));
        res
          .status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
          .json(
            new ResponseModel(transactionId).withError(
              DomainErrorCodes.SYSTEM_ERROR,
              "Internal Server Error",
            ),
          );
      }
    },
  );

  return router;
}
