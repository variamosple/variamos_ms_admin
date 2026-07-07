import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { PermissionModel } from "../Permission/Permission";
import { UserRoleModel } from "../User/UserRole";
import { RoleAttributes, RoleModel } from "./Role";
import { RolePermissionModel } from "./RolePermission";

export class RoleRepositoryImpl
  extends BaseRepository
  implements IRoleRepository, IGuestRoleRepository
{
  public async queryRoles(request: RequestModel<RoleFilter>): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter = new RoleFilter() } = request;

      const replacements = super.initializeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query<{ count: string }>(
        `
            SELECT COUNT(1) AS count
            FROM variamos.role
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');   
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result) => Number(result[0]?.count) || 0);

      const where: WhereOptions<RoleAttributes> = {};

      if (filter.name) {
        where.name = { [Op.iLike]: `%${String(replacements.name)}%` };
      }

      const pageSize = filter.pageSize ?? 10;
      const pageNumber = filter.pageNumber ?? 1;

      response.data = await RoleModel.findAll({
        where,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        order: [["name", "ASC"]],
      }).then((res) => res.map(({ id, name }) => new Role(id, name)));
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getRoles:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Role data is required.");
      }

      const newRole = await RoleModel.create({
        name: data.name,
      });

      response.data = new Role(newRole.id, newRole.name);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in createRole:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async deleteRole(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data: id } = request;
      if (!id) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Role ID is required.");
      }

      const numericId = Number(id);

      await UserRoleModel.destroy({ where: { roleId: numericId } });
      await RolePermissionModel.destroy({ where: { roleId: numericId } });
      await RoleModel.destroy({ where: { id: numericId } });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in deleteRole:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async queryById(request: RequestModel<string>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Role ID is required.");
      }

      const found = await RoleModel.findOne({
        where: { id: Number(data) },
      });
      response.data = found ? new Role(found.id, found.name) : null;
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryById:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async updateRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      const { data } = request;
      if (!data || data.id === undefined || data.id === null) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Role data with ID is required.");
      }

      await RoleModel.update(
        {
          name: data.name,
        },
        { where: { id: data.id } },
      );

      response.data = data;
    } catch (error) {
      const err = error as Error;
      logger.err("Error in updateRole:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async queryGuestRole(request: RequestModel<void>): Promise<ResponseModel<Role>> {
    const response = new ResponseModel<Role>(request.transactionId);

    try {
      response.data = await RoleModel.findOne({
        where: {
          name: {
            [Op.iLike]: "guest",
          },
        },
        include: [
          {
            model: PermissionModel,
            as: "permissions",
            attributes: ["id", "name"],
            through: { attributes: [] },
          },
        ],
        attributes: ["id", "name"],
      }).then((role) => {
        if (!role) {
          return null;
        }
        const {
          id: roleId,
          name: roleName,
          permissions = [],
        } = role as RoleModel & { permissions?: PermissionModel[] };

        return new Role(
          roleId,
          roleName,
          permissions.map(({ id, name }) => new Permission(id, name)),
        );
      });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryGuestRole:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }
}

export const RoleRepositoryInstance = new RoleRepositoryImpl();
