import { QueryTypes } from "sequelize";
import { CountryCode } from "#src/Domain/Countries/Entity/CountryCode.js";
import { User } from "#src/Domain/User/Entity/User.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import type { PermissionModel } from "../Permission/Permission.js";
import type { RoleModel } from "../Role/Role.js";
import type { UserModel } from "./User.js";

/** The user, the state of its account and its country, as stored. */
export function accountOf(dbUser: UserModel): User {
  return (
    User.builder()
      .setId(dbUser.id)
      .setUser(dbUser.user)
      .setName(dbUser.name)
      .setEmail(dbUser.email)
      .setIsEnabled(dbUser.isEnabled === true)
      .setIsDeleted(dbUser.isDeleted === true)
      // A stored code that is not one never blocks the sign-in
      .setCountryCode(
        CountryCode.isValid(dbUser.countryCode) ? dbUser.countryCode : null,
      )
      .build()
  );
}

/** The account with the roles it holds and the permissions they give. */
export async function withRolesAndPermissions(user: User): Promise<User> {
  if (!user?.id) {
    return user;
  }

  const replacements = { userId: user.id };

  const roles = await VARIAMOS_ORM.query<RoleModel>(
    `
      SELECT DISTINCT r.name
      FROM ${DB_SCHEMA}.role r
      INNER JOIN ${DB_SCHEMA}.user_role ur ON r.id = ur.role_id
      WHERE ur.user_id = :userId
    `,
    {
      type: QueryTypes.SELECT,
      replacements,
    },
  ).then((res) => res.map(({ name }) => name));

  const permissions = await VARIAMOS_ORM.query<PermissionModel>(
    `
      SELECT DISTINCT p.name
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

  return user.withAccess(roles, permissions);
}
