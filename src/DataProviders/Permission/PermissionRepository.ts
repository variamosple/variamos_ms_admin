import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { RolePermissionModel } from "../Role/RolePermission";
import { PermissionAttributes, PermissionModel } from "./Permission";

export class PermissionRepositoryImpl extends BaseRepository {
  async queryPermissions(
    request: RequestModel<PermissionFilter>
  ): Promise<ResponseModel<Permission[]>> {
    const response = new ResponseModel<Permission[]>(request.transactionId);

    try {
      const { data: filter = new PermissionFilter() } = request;

      const replacements = super.initilizeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.permission
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      const where: WhereOptions<PermissionAttributes> = {};

      if (filter.name) {
        where.name = { [Op.iLike]: `%${replacements.name}%` };
      }

      response.data = await PermissionModel.findAll({
        where,
        limit: filter.pageSize!,
        offset: (filter.pageNumber! - 1) * filter.pageSize!,
      }).then((response) =>
        response.map(({ id, name }) => new Permission(id, name))
      );
    } catch (error) {
      logger.err("Error in queryPermissions:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async createPermission(
    request: RequestModel<Permission>
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      const newPermission = await PermissionModel.create({
        name: data!.name!,
      });

      response.data = new Permission(newPermission.id, newPermission.name);
    } catch (error) {
      logger.err("Error in createPermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async deletePermission(
    request: RequestModel<number>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      await RolePermissionModel.destroy({ where: { permissionId: id } });
      await PermissionModel.destroy({ where: { id } });
    } catch (error) {
      logger.err("Error in deletePermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async queryById(
    request: RequestModel<number>
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      response.data = await PermissionModel.findOne({
        where: { id: data },
      }).then((response) =>
        !response ? undefined : new Permission(response.id, response.name)
      );
    } catch (error) {
      logger.err("Error in queryById:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async updatePermission(
    request: RequestModel<Permission>
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      await PermissionModel.update(
        {
          name: data!.name!,
        },
        { where: { id: data!.id! } }
      );

      response.data = data;
    } catch (error) {
      logger.err("Error in updatePermission:");
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

export const PermissionRepositoryInstance = new PermissionRepositoryImpl();
