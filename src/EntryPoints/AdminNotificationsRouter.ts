import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type {
  NotificationAudience,
  NotificationDispatchRequest,
  NotificationDispatchUseCase,
} from "#src/Domain/Notification/UseCase/NotificationDispatchUseCase.js";
import { actorOf } from "./actor.js";
import {
  notificationAudienceBody,
  notificationDispatchBody,
} from "./adminRequestBodies.js";
import { sendError } from "./errorResponse.js";
import { validBody } from "./requestBody.js";

const TRANSACTION_ID = "dispatchNotification";
const COUNT_TRANSACTION_ID = "countNotificationRecipients";

export const ADMIN_NOTIFICATIONS_V1_ROUTE = "/v1/admin/notifications";

type DispatchBody = Omit<NotificationDispatchRequest, "actorId">;

export function createAdminNotificationsRouter(
  notifications: NotificationDispatchUseCase,
): Router {
  const router = Router();

  // How many accounts a dispatch would reach, for the confirmation shown
  // before sending (UX-02); nothing is sent nor recorded
  router.post(
    "/recipients/count",
    hasPermissions(["admin::notifications::dispatch"]),
    validBody(notificationAudienceBody, COUNT_TRANSACTION_ID),
    async (req: Request, res) => {
      try {
        const response = await notifications.countRecipients(
          new RequestModel<NotificationAudience>(
            COUNT_TRANSACTION_ID,
            req.body as NotificationAudience,
          ),
        );
        return res
          .status(
            response.errorCode
              ? HttpStatusCodes.BAD_REQUEST
              : HttpStatusCodes.OK,
          )
          .json(response);
      } catch (error: unknown) {
        return sendError(res, error, COUNT_TRANSACTION_ID);
      }
    },
  );

  router.post(
    "/dispatch",
    hasPermissions(["admin::notifications::dispatch"]),
    validBody(notificationDispatchBody, TRANSACTION_ID),
    async (req: Request, res) => {
      try {
        const response = await notifications.dispatch(
          new RequestModel<NotificationDispatchRequest>(TRANSACTION_ID, {
            ...(req.body as DispatchBody),
            actorId: actorOf(req) ?? null,
          }),
        );
        return res
          .status(
            response.errorCode
              ? HttpStatusCodes.BAD_REQUEST
              : HttpStatusCodes.OK,
          )
          .json(response);
      } catch (error: unknown) {
        return sendError(res, error, TRANSACTION_ID);
      }
    },
  );

  return router;
}
