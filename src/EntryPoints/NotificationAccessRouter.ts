import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  INotificationAccessTokenIssuer,
  NotificationAccessToken,
} from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import { sendError } from "./errorResponse.js";
import { accountLimiter } from "./RateLimits.js";

export const NOTIFICATION_ACCESS_V1_ROUTE = "/v1/notifications";

const isGuest = (roles: unknown): boolean =>
  Array.isArray(roles) &&
  roles.some(
    (role: unknown) =>
      typeof role === "string" && role.toLowerCase() === "guest",
  );

/**
 * Gives a signed-in user the short-lived token used to call the
 * notification service (ADR-0001). Any session may get a token for itself:
 * no permission is required. The account is read again first: a disabled
 * or deleted one gets no new token, and the notification service closes
 * its socket when the last one expires (ADM-N19). A guest has no account
 * to read.
 */
export function createNotificationAccessRouter(
  issuer: INotificationAccessTokenIssuer,
  authMiddleware: RequestHandler,
  sessionUsers: Pick<UserQueryUseCase, "sessionUser">,
): Router {
  const router = Router();

  router.get(
    "/access-token",
    authMiddleware,
    accountLimiter(
      "issueNotificationAccessToken",
      "notificationTokenPerAccount",
    ),
    async (req: Request, res: Response) => {
      const transactionId = "issueNotificationAccessToken";
      res.setHeader("Cache-Control", "no-store");
      const userId = req.user?.id;
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
        if (!isGuest(req.user?.roles)) {
          const account = await sessionUsers.sessionUser(
            new RequestModel(transactionId, String(userId)),
          );
          if (account.errorCode === DomainErrorCodes.SYSTEM_ERROR) {
            throw new Error(account.message ?? "Account not read");
          }
          if (account.errorCode || !account.data) {
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
        }
        const accessToken = await issuer.issue(String(userId));
        res
          .status(HttpStatusCodes.OK)
          .json(
            new ResponseModel<NotificationAccessToken>(
              transactionId,
            ).withResponse(accessToken),
          );
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return router;
}
