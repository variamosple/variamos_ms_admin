import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RoleModel } from "#src/DataProviders/Role/Role.js";
import { UserModel } from "#src/DataProviders/User/User.js";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { NotificationClientInstance } from "#src/Infrastructure/Notification/NotificationClient.js";
import { actorOf } from "./actor.js";
import { sendError } from "./errorResponse.js";

const TRANSACTION_ID = "dispatchNotification";
const COUNT_TRANSACTION_ID = "countNotificationRecipients";

export const ADMIN_NOTIFICATIONS_V1_ROUTE = "/v1/admin/notifications";

type Audience = "broadcast" | "role" | "users";

interface DispatchRequest {
  audience: Audience;
  roles?: string[];
  userIds?: string[];
  title: string;
  body: string;
}

const invalid = (message: string, transactionId = TRANSACTION_ID) =>
  new ResponseModel<void>(transactionId).withError(
    DomainErrorCodes.INVALID_INPUT,
    message,
  );

// Active, non-deleted accounts of the audience; an error answer otherwise
async function recipientsOf(
  request: DispatchRequest,
  transactionId = TRANSACTION_ID,
): Promise<string[] | ResponseModel<void>> {
  const { audience, roles, userIds } = request;
  if (audience === "broadcast") {
    const users = await UserModel.findAll({
      attributes: ["id"],
      where: { isDeleted: false, isEnabled: true },
    });
    return users.map((u) => u.id as string).filter(Boolean);
  }
  if (audience === "role") {
    if (!roles || roles.length === 0) {
      return invalid(
        "At least one role is required for role audience.",
        transactionId,
      );
    }
    const rolesData = await RoleModel.findAll({
      where: { name: roles },
      include: [
        {
          model: UserModel,
          as: "users",
          attributes: ["id"],
          where: { isDeleted: false, isEnabled: true },
          through: { attributes: [] },
        },
      ],
    });
    const ids = rolesData.flatMap(
      (r) =>
        (r as RoleModel & { users?: UserModel[] }).users?.map(
          (u) => u.id as string,
        ) || [],
    );
    return Array.from(new Set(ids)).filter(Boolean);
  }
  if (audience === "users") {
    if (!userIds || userIds.length === 0) {
      return invalid(
        "At least one user ID is required for users audience.",
        transactionId,
      );
    }
    return userIds;
  }
  return invalid("Invalid audience type.", transactionId);
}

export function createAdminNotificationsRouter(
  journal: IActivityJournal,
): Router {
  const router = Router();

  // How many accounts a dispatch would reach, for the confirmation shown
  // before sending (UX-02); nothing is sent nor recorded
  router.post(
    "/recipients/count",
    hasPermissions(["admin::notifications::dispatch"]),
    async (req: Request, res) => {
      try {
        const recipients = await recipientsOf(
          req.body as DispatchRequest,
          COUNT_TRANSACTION_ID,
        );
        if (recipients instanceof ResponseModel) {
          return res.status(HttpStatusCodes.BAD_REQUEST).json(recipients);
        }
        return res
          .status(HttpStatusCodes.OK)
          .json(
            new ResponseModel<{ count: number }>(
              COUNT_TRANSACTION_ID,
            ).withResponse({ count: recipients.length }),
          );
      } catch (error: unknown) {
        return sendError(res, error, COUNT_TRANSACTION_ID);
      }
    },
  );

  router.post(
    "/dispatch",
    hasPermissions(["admin::notifications::dispatch"]),
    async (req: Request, res) => {
      const request = req.body as DispatchRequest;
      const actorId = actorOf(req) ?? null;
      let recipientCount = 0;

      // The only administration operation without a use case: it is
      // recorded here; the body of the message is not kept (T-24)
      const dispatch = async (): Promise<ResponseModel<void>> => {
        if (!request.title || !request.body) {
          return invalid("Title and body are required.");
        }
        const recipients = await recipientsOf(request);
        if (recipients instanceof ResponseModel) return recipients;
        recipientCount = recipients.length;

        // Dispatch via NotificationClient using the admin_alert template key
        await NotificationClientInstance.dispatchNotification({
          recipients: {
            userIds: recipients.length > 0 ? recipients : undefined,
          },
          templateKey: "admin_alert",
          variables: { title: request.title, body: request.body },
          actorId,
        });
        return new ResponseModel<void>(
          TRANSACTION_ID,
          undefined,
          "Notification dispatched successfully.",
        );
      };

      try {
        const response = await withJournal(
          journal,
          {
            actorId,
            action: "notification.dispatch",
            entityType: "notification",
            after: {
              audience: request.audience ?? null,
              roles: request.roles ?? null,
              title: request.title ?? null,
            },
            transactionId: TRANSACTION_ID,
          },
          dispatch,
          () => ({
            after: {
              audience: request.audience,
              roles: request.roles ?? null,
              title: request.title,
              recipientCount,
            },
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
