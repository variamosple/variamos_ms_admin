/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/explicit-member-accessibility, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { RolePermissionModel } from "../Role/RolePermission";
import { PermissionAttributes, PermissionModel } from "./Permission";

import { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository";

export class PermissionRepositoryImpl extends BaseRepository implements IPermissionRepository {
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
      ).then((result: any) => +result?.[0]?.count || 0);

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
      }).then((response) => response.map(({ id, name }) => new Permission(id, name)));
    } catch (error) {
      logger.err("Error in queryPermissions:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }

  async createPermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        response.withError(DomainErrorCodes.INVALID_INPUT, "Permission data is required.");
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
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }

  async deletePermission(request: RequestModel<number>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      await RolePermissionModel.destroy({ where: { permissionId: id } });
      await PermissionModel.destroy({ where: { id } });
    } catch (error) {
      logger.err("Error in deletePermission:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }

  async queryById(request: RequestModel<number>): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      response.data = await PermissionModel.findOne({
        where: { id: data },
      }).then((response) => (!response ? undefined : new Permission(response.id, response.name)));
    } catch (error) {
      logger.err("Error in queryById:");
      logger.err(request);
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }

  async updatePermission(request: RequestModel<Permission>): Promise<ResponseModel<Permission>> {
    const response = new ResponseModel<Permission>(request.transactionId);

    try {
      const { data } = request;

      if (!data || data.id === undefined) {
        response.withError(DomainErrorCodes.INVALID_INPUT, "Permission data and ID are required.");
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
      response.withError(DomainErrorCodes.SYSTEM_ERROR, "Internal server error");
    }

    return response;
  }
}

export const PermissionRepositoryInstance = new PermissionRepositoryImpl();
