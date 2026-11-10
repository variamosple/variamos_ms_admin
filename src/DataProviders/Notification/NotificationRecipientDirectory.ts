import type { INotificationRecipientDirectory } from "#src/Domain/Notification/INotificationRecipientDirectory.js";
import { RoleModel } from "../Role/Role.js";
import { UserModel } from "../User/User.js";

export class NotificationRecipientDirectory
  implements INotificationRecipientDirectory
{
  public async activeUserIds(): Promise<string[]> {
    const users = await UserModel.findAll({
      attributes: ["id"],
      where: { isDeleted: false, isEnabled: true },
    });
    return users.map((u) => u.id as string).filter(Boolean);
  }

  public async activeUserIdsWithRoles(roles: string[]): Promise<string[]> {
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
}
