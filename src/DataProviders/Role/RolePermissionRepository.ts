import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import { RolePermission } from "#src/Domain/Role/Entity/RolePermission.js";
import type { RolePermissionFilter } from "#src/Domain/Role/Entity/RolePermissionFilter.js";
import type { IRolePermissionRepository } from "#src/Domain/Role/Repository/IRolePermissionRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { BaseRepository } from "../BaseRepository.js";
import type { PermissionModel } from "../Permission/Permission.js";
import { RolePermissionModel } from "./RolePermission.js";

// A permission matches the search by a part of its name or by its exact id
const SEARCH_CONDITION = `(:search IS NULL OR p.name ILIKE '%' || :search || '%' OR CAST(p.id AS TEXT) = :search)`;

export class RolePermissionRepositoryImpl
  extends BaseRepository
  implements IRolePermissionRepository
{
  public async queryRolePermissions(
    request: RequestModel<RolePermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    const response = new ResponseModel<Permission[]>(request.transactionId);

    try {
      const { data: filter } = request;

      const pageNumber = filter?.pageNumber ?? 1;
      const pageSize = filter?.pageSize ?? 10;

      const replacements = super.initializeReplacements({
        roleId: filter?.roleId,
        search: filter?.search || null,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      });

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM ${DB_SCHEMA}.permission p
            INNER JOIN ${DB_SCHEMA}.role_permission rp ON (p.id = rp.permission_id)
            WHERE rp.role_id = :roleId
              AND ${SEARCH_CONDITION};
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result: object[]) => {
        const countObj = result?.[0] as { count?: string | number } | undefined;
        return countObj ? Number(countObj.count) : 0;
      });

      response.data = await VARIAMOS_ORM.query<PermissionModel>(
        `
        SELECT p.*
        FROM ${DB_SCHEMA}.permission p
        INNER JOIN ${DB_SCHEMA}.role_permission rp ON p.id = rp.permission_id
        WHERE rp.role_id = :roleId
          AND ${SEARCH_CONDITION}
        ORDER BY p.name ASC, p.id ASC
        LIMIT :limit OFFSET :offset;
      `,
        {
          type: QueryTypes.SELECT,
          replacements,
        },
      ).then((res) => res.map(({ id, name }) => new Permission(id, name)));
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryRolePermissions:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async createRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<RolePermission>> {
    const response = new ResponseModel<RolePermission>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "RolePermission data is required.",
        );
      }

      const roleId = data.roleId;
      const permissionId = data.permissionId;

      if (!roleId || !permissionId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "roleId and permissionId are required.",
        );
      }

      const foundRole = await RolePermissionModel.findOne({
        where: {
          roleId,
          permissionId,
        },
      });

      if (foundRole) {
        response.data = request.data;
      } else {
        const newRolePermission = await RolePermissionModel.create({
          roleId,
          permissionId,
        });

        response.data = new RolePermission(
          newRolePermission.roleId,
          newRolePermission.permissionId,
        );
      }
    } catch (error) {
      const err = error as Error;
      logger.err("Error in createRolePermission:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async deleteRolePermission(
    request: RequestModel<RolePermission>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "RolePermission data is required.",
        );
      }

      const roleId = data.roleId;
      const permissionId = data.permissionId;

      if (!roleId || !permissionId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "roleId and permissionId are required.",
        );
      }

      await RolePermissionModel.destroy({
        where: { roleId, permissionId },
      });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in deleteRolePermission:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}
