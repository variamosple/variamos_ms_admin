import { QueryTypes } from "sequelize";
import { User } from "#src/Domain/User/Entity/User.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import type { PermissionModel } from "../Permission/Permission.js";
import type { RoleModel } from "../Role/Role.js";
import type { UserModel } from "./User.js";

/** The user and the state of its account, as stored. */
export function accountOf(dbUser: UserModel): User {
  return User.builder()
    .setId(dbUser.id)
    .setUser(dbUser.user)
    .setName(dbUser.name)
    .setEmail(dbUser.email)
    .setIsEnabled(dbUser.isEnabled === true)
    .setIsDeleted(dbUser.isDeleted === true)
    .build();
}

export async function enrichUserRolesAndPermissions(user: User) {
  if (!user?.id) {
    return;
  }

  const replacements = { userId: user.id };

  user.roles = await VARIAMOS_ORM.query<RoleModel>(
    `
      SELECT r.name
      FROM ${DB_SCHEMA}.role r
      INNER JOIN ${DB_SCHEMA}.user_role ur ON r.id = ur.role_id
      WHERE ur.user_id = :userId
    `,
    {
      type: QueryTypes.SELECT,
      replacements,
    },
  ).then((res) => res.map(({ name }) => name));

  user.permissions = await VARIAMOS_ORM.query<PermissionModel>(
    `
      SELECT p.name
      FROM ${DB_SCHEMA}.user_role ur
      INNER JOIN ${DB_SCHEMA}.role_permission rp ON ur.role_id = rp.role_id
      INNER JOIN ${DB_SCHEMA}.permission p ON p.id = rp.permission_id
      WHERE ur.user_id = :userId
    `,
    {
      type: QueryTypes.SELECT,
      replacements,
    },
  ).then((res) => res.map(({ name }) => name));
}
