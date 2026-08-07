import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-member-accessibility */
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import logger from "jet-logger";
import { Op, QueryTypes, type WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository.js";
import { RolePermissionModel } from "../Role/RolePermission.js";
import { type PermissionAttributes, PermissionModel } from "./Permission.js";

import type { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository.js";

export class PermissionRepositoryImpl
  extends BaseRepository
  implements IPermissionRepository
{
  async queryPermissions(
    request: RequestModel<PermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    const response = new ResponseModel<Permission[]>(request.transactionId);

    try {
      const { data: filter = new PermissionFilter() } = request;

      const replacements = super.initializeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM ${DB_SCHEMA}.permission
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result) => {
        const rows = result as Array<{ count: string | number }>;
        return +rows[0]?.count || 0;
      });

      const where: WhereOptions<PermissionAttributes> = {};

      if (filter.name) {
        where.name = { [Op.iLike]: `%${replacements.name}%` };
      }

      const pageSize = filter.pageSize ?? 10;
      const pageNumber = filter.pageNumber ?? 1;
      const offset = (pageNumber - 1) * pageSize;

      response.data = await PermissionModel.findAll({
        where,
        limit: pageSize,
        offset,
        order: [["name", "ASC"]],
      }).then((response) =>
        response.map(({ id, name }) => new Permission(id, name)),
      );
    } catch (error) {
      logger.err("Error in queryPermissions:");
      logger.err(request);
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async createPermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Permission data is required.",
        );
        return response;
      }

      const newPermission = await PermissionModel.create({
        name: data.name,
      });

      response.data = new Permission(newPermission.id, newPermission.name);
    } catch (error) {
      logger.err("Error in createPermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async deletePermission(
    request: RequestModel<number>,
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
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async queryById(
    request: RequestModel<number>,
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      response.data = await PermissionModel.findOne({
        where: { id: data },
      }).then((response) =>
        !response ? undefined : new Permission(response.id, response.name),
      );
    } catch (error) {
      logger.err("Error in queryById:");
      logger.err(request);
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  async updatePermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      if (!data || data.id === undefined) {
        response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Permission data and ID are required.",
        );
        return response;
      }

      await PermissionModel.update(
        {
          name: data.name,
        },
        { where: { id: data.id ?? undefined } },
      );

      response.data = data;
    } catch (error) {
      logger.err("Error in updatePermission:");
      logger.err(request);
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}

export const PermissionRepositoryInstance = new PermissionRepositoryImpl();
