import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { UserRoleModel } from "../User/UserRole";
import { RoleAttributes, RoleModel } from "./Role";
import { RolePermissionModel } from "./RolePermission";

export class RoleRepositoryImpl extends BaseRepository {
  async queryRoles(
    request: RequestModel<RoleFilter>
  ): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter = new RoleFilter() } = request;

      const replacements = super.initilizeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.role
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');   
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      const where: WhereOptions<RoleAttributes> = {};

      if (filter.name) {
        where.name = { [Op.iLike]: `%${replacements.name}%` };
      }

      response.data = await RoleModel.findAll({
        where,
        limit: filter.pageSize!,
        offset: (filter.pageNumber! - 1) * filter.pageSize!,
      }).then((response) => response.map(({ id, name }) => new Role(id, name)));
    } catch (error) {
      logger.err("Error in getRoles:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;

      const newRole = await RoleModel.create({
        name: data!.name!,
      });

      response.data = new Role(newRole.id, newRole.name);
    } catch (error) {
      logger.err("Error in createRole:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async deleteRole(
    request: RequestModel<number>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;

      await UserRoleModel.destroy({ where: { roleId: id } });
      await RolePermissionModel.destroy({ where: { roleId: id } });
      await RoleModel.destroy({ where: { id } });
    } catch (error) {
      logger.err("Error in deleteRole:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async queryById(request: RequestModel<number>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;

      response.data = await RoleModel.findOne({
        where: { id: data },
      }).then((response) =>
        !response ? undefined : new Role(response.id, response.name)
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

  async updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;

      await RoleModel.update(
        {
          name: data!.name!,
        },
        { where: { id: data!.id! } }
      );

      response.data = data;
    } catch (error) {
      logger.err("Error in updateRole:");
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

export const RoleRepositoryInstance = new RoleRepositoryImpl();
