import { QueryTypes } from "sequelize";
import type {
  ISecurityAlertRecipients,
  SecurityAlertRecipient,
} from "#src/Domain/Activity/SecurityAlerts.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";

/**
 * The active accounts holding a permission receive the security alerts
 * (T-24): the top permission, so that no new permission is needed.
 */
export class SecurityAlertRecipientRepository
  implements ISecurityAlertRecipients
{
  public constructor(private readonly permission: string) {}

  public async list(): Promise<SecurityAlertRecipient[]> {
    // user_role.user_id is text while user.id is a uuid: compare as text
    return VARIAMOS_ORM.query<SecurityAlertRecipient>(
      `
      SELECT DISTINCT u."id"::text AS "userId", u."email" AS "email"
      FROM "${DB_SCHEMA}"."user_role" ur
      JOIN "${DB_SCHEMA}"."role_permission" rp ON rp."role_id" = ur."role_id"
      JOIN "${DB_SCHEMA}"."permission" p
        ON p."id" = rp."permission_id" AND p."name" = :permission
      JOIN "${DB_SCHEMA}"."user" u ON u."id"::text = ur."user_id"
      WHERE u."is_enabled" AND NOT u."is_deleted"
      `,
      {
        replacements: { permission: this.permission },
        type: QueryTypes.SELECT,
      },
    );
  }
}
