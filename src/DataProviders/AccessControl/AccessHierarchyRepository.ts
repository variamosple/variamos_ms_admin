import { QueryTypes } from "sequelize";
import type {
  AccountPermissions,
  IAccessHierarchyRepository,
} from "#src/Domain/AccessControl/IAccessHierarchyRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";

// user_role.user_id is text while user.id is a uuid: compare as text
export class AccessHierarchyRepositoryImpl
  implements IAccessHierarchyRepository
{
  public async getAccountPermissions(
    userId: string,
  ): Promise<AccountPermissions | null> {
    const rows = await VARIAMOS_ORM.query<AccountPermissions>(
      `
      SELECT (u."is_enabled" AND NOT u."is_deleted") AS "isActive",
        COALESCE(array_agg(DISTINCT p."name") FILTER (WHERE p."name" IS NOT NULL),
          '{}') AS "permissions"
      FROM "${DB_SCHEMA}"."user" u
      LEFT JOIN "${DB_SCHEMA}"."user_role" ur ON ur."user_id" = u."id"::text
      LEFT JOIN "${DB_SCHEMA}"."role_permission" rp ON rp."role_id" = ur."role_id"
      LEFT JOIN "${DB_SCHEMA}"."permission" p ON p."id" = rp."permission_id"
      WHERE u."id"::text = :userId
      GROUP BY u."id", u."is_enabled", u."is_deleted"
      `,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  public async getRolePermissions(roleId: number): Promise<string[] | null> {
    const rows = await VARIAMOS_ORM.query<{ permissions: string[] }>(
      `
      SELECT COALESCE(array_agg(p."name") FILTER (WHERE p."name" IS NOT NULL),
          '{}') AS "permissions"
      FROM "${DB_SCHEMA}"."role" r
      LEFT JOIN "${DB_SCHEMA}"."role_permission" rp ON rp."role_id" = r."id"
      LEFT JOIN "${DB_SCHEMA}"."permission" p ON p."id" = rp."permission_id"
      WHERE r."id" = :roleId
      GROUP BY r."id"
      `,
      { replacements: { roleId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.permissions ?? null;
  }

  public async getPermissionName(permissionId: number): Promise<string | null> {
    const rows = await VARIAMOS_ORM.query<{ name: string }>(
      `SELECT "name" FROM "${DB_SCHEMA}"."permission" WHERE "id" = :permissionId`,
      { replacements: { permissionId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.name ?? null;
  }

  public async listActiveHolders(
    permission: string,
  ): Promise<{ userId: string; roleId: number }[]> {
    return VARIAMOS_ORM.query<{ userId: string; roleId: number }>(
      `
      SELECT ur."user_id" AS "userId", ur."role_id" AS "roleId"
      FROM "${DB_SCHEMA}"."user_role" ur
      JOIN "${DB_SCHEMA}"."role_permission" rp ON rp."role_id" = ur."role_id"
      JOIN "${DB_SCHEMA}"."permission" p
        ON p."id" = rp."permission_id" AND p."name" = :permission
      JOIN "${DB_SCHEMA}"."user" u ON u."id"::text = ur."user_id"
      WHERE u."is_enabled" AND NOT u."is_deleted"
      `,
      { replacements: { permission }, type: QueryTypes.SELECT },
    );
  }
}
