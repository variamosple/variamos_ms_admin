import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission";
import { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { PermissionModel } from "../Permission/Permission";
import { RolePermissionModel } from "./RolePermission";

export class RolePermissionRepositoryImpl extends BaseRepository {
  async queryRolePermissions(
    request: RequestModel<RolePermissionFilter>
  ): Promise<ResponseModel<Permission[]>> {
    const response = new ResponseModel<Permission[]>(request.transactionId);

    try {
      const { data: filter } = request;

      const replacements = super.initilizeReplacements({
        roleId: filter?.roleId,
        limit: filter?.pageSize,
        offset: (filter?.pageNumber! - 1) * filter?.pageSize!,
      });

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.permission p
            INNER JOIN variamos.role_permission rp ON (p.id = rp.permission_id)
            WHERE rp.role_id = :roleId;   
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      response.data = await VARIAMOS_ORM.query<PermissionModel>(
        `
        SELECT p.*
        FROM variamos.permission p
        INNER JOIN variamos.role_permission rp ON p.id = rp.permission_id
        WHERE rp.role_id = :roleId
        LIMIT :limit OFFSET :offset;
      `,
        {
          type: QueryTypes.SELECT,
          replacements,
        }
      ).then((response) =>
        response.map(({ id, name }) => new Permission(id, name))
      );
    } catch (error) {
      logger.err("Error in queryRolePermissions:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async createRolePermission(
    request: RequestModel<RolePermission>
  ): Promise<ResponseModel<RolePermission>> {
    const response = new ResponseModel<RolePermission>(request.transactionId);

    try {
      const { data } = request;

      const foundRole = await RolePermissionModel.findOne({
        where: {
          roleId: data?.roleId!,
          permissionId: data?.permissionId!,
        },
      });

      if (foundRole) {
        response.data = request.data;
      } else {
        const newRolePermission = await RolePermissionModel.create({
          roleId: data?.roleId!,
          permissionId: data?.permissionId!,
        });

        response.data = new RolePermission(
          newRolePermission.roleId,
          newRolePermission.permissionId
        );
      }
    } catch (error) {
      logger.err("Error in createRolePermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async deleteRolePermission(
    request: RequestModel<RolePermission>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;

      await RolePermissionModel.destroy({
        where: { roleId: data?.roleId!, permissionId: data?.permissionId! },
      });
    } catch (error) {
      logger.err("Error in deleteRolePermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }
}

export const RolePermissionRepositoryInstance =
  new RolePermissionRepositoryImpl();
