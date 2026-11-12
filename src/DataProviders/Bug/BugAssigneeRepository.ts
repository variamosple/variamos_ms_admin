import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import type { IBugAssigneeRepository } from "#src/Domain/Bug/Repository/IBugAssigneeRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { assigneesOf } from "./bugRows.js";

/** The administrators bugs are assigned to. */
export class BugAssigneeRepositoryImpl implements IBugAssigneeRepository {
  public async setAssignees(
    request: RequestModel<{
      bugId: string;
      userIds: string[];
      assignedBy?: string;
    }>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    const response = new ResponseModel<BugUserRef[]>(request.transactionId);
    try {
      const data = request.data;
      if (!data?.bugId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const { bugId, userIds, assignedBy } = data;
      await VARIAMOS_ORM.transaction(async (transaction) => {
        await VARIAMOS_ORM.query(
          userIds.length > 0
            ? `DELETE FROM ${DB_SCHEMA}.bug_assignees
                WHERE bug_id = :bugId AND user_id NOT IN (:userIds)`
            : `DELETE FROM ${DB_SCHEMA}.bug_assignees WHERE bug_id = :bugId`,
          { replacements: { bugId, userIds }, transaction },
        );
        for (const userId of userIds) {
          await VARIAMOS_ORM.query(
            `INSERT INTO ${DB_SCHEMA}.bug_assignees (bug_id, user_id, assigned_by)
             VALUES (:bugId, :userId, :assignedBy)
             ON CONFLICT (bug_id, user_id) DO NOTHING`,
            {
              replacements: { bugId, userId, assignedBy: assignedBy ?? null },
              transaction,
            },
          );
        }
      });
      response.data = (await assigneesOf([bugId])).get(bugId) ?? [];
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async queryUsersWithPermission(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    const response = new ResponseModel<BugUserRef[]>(request.transactionId);
    try {
      response.data = await VARIAMOS_ORM.query<BugUserRef>(
        `SELECT DISTINCT u.id, u.name
           FROM ${DB_SCHEMA}.user u
           JOIN ${DB_SCHEMA}.user_role ur ON ur.user_id = u.id
           JOIN ${DB_SCHEMA}.role_permission rp ON rp.role_id = ur.role_id
           JOIN ${DB_SCHEMA}.permission p ON p.id = rp.permission_id
          WHERE p.name = :permission AND u.is_enabled AND NOT u.is_deleted
          ORDER BY u.name`,
        {
          replacements: { permission: request.data ?? "" },
          type: QueryTypes.SELECT,
        },
      );
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }
}
