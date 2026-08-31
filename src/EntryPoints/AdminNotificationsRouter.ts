import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import { RoleModel } from "@src/DataProviders/Role/Role.js";
import { UserModel } from "@src/DataProviders/User/User.js";
import { NotificationClientInstance } from "@src/Infrastructure/Notification/NotificationClient.js";
import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import logger from "jet-logger";

export const ADMIN_NOTIFICATIONS_V1_ROUTE = "/v1/admin/notifications";

export function createAdminNotificationsRouter(): Router {
  const router = Router();

  router.post(
    "/dispatch",
    hasPermissions(["admin::notifications::dispatch"]),
    async (req: Request, res) => {
      const { audience, roles, userIds, title, body } = req.body as {
        audience: "broadcast" | "role" | "users";
        roles?: string[];
        userIds?: string[];
        title: string;
        body: string;
      };

      try {
        if (!title || !body) {
          return res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: "Title and body are required.",
          });
        }

        let resolvedUserIds: string[] = [];

        if (audience === "broadcast") {
          // Query all active and non-deleted user IDs
          const users = await UserModel.findAll({
            attributes: ["id"],
            where: { isDeleted: false, isEnabled: true },
          });
          resolvedUserIds = users.map((u) => u.id as string).filter(Boolean);
        } else if (audience === "role") {
          if (!roles || roles.length === 0) {
            return res.status(HttpStatusCodes.BAD_REQUEST).json({
              error: "At least one role is required for role audience.",
            });
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
          resolvedUserIds = Array.from(new Set(ids)).filter(Boolean);
        } else if (audience === "users") {
          if (!userIds || userIds.length === 0) {
            return res.status(HttpStatusCodes.BAD_REQUEST).json({
              error: "At least one user ID is required for users audience.",
            });
          }
          resolvedUserIds = userIds;
        } else {
          return res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: "Invalid audience type.",
          });
        }

        // Dispatch via NotificationClient using the admin_alert template key
        await NotificationClientInstance.dispatchNotification({
          recipients: {
            userIds: resolvedUserIds.length > 0 ? resolvedUserIds : undefined,
          },
          templateKey: "admin_alert",
          variables: {
            title,
            body,
          },
          actorId: (req.user as { id?: string })?.id || null,
        });

        return res.status(HttpStatusCodes.OK).json({
          errorCode: 0,
          message: "Notification dispatched successfully.",
        });
      } catch (error: unknown) {
        logger.err(error);
        const err = error as Error;
        return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
          errorCode: 500,
          message:
            err.message ||
            "Internal server error occurred while dispatching notifications.",
        });
      }
    },
  );

  return router;
}
