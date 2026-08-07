import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import { Role } from "@src/Domain/Role/Entity/Role.js";

import { UserRole } from "@src/Domain/User/Entity/UserRole.js";
import type { UserRoleFilter } from "@src/Domain/User/Entity/UserRoleFilter.js";
import type { IUserRoleRepository } from "@src/Domain/User/Repository/IUserRoleRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { BaseRepository } from "../BaseRepository.js";
import { PermissionModel } from "../Permission/Permission.js";
import { RoleModel } from "../Role/Role.js";
import { UserModel } from "./User.js";
import { UserRoleModel } from "./UserRole.js";

export class UserRoleRepositoryImpl
  extends BaseRepository
  implements IUserRoleRepository
{
  public async queryUserRoles(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter } = request;

      const pageNumber = filter?.pageNumber ?? 1;
      const pageSize = filter?.pageSize ?? 10;

      const replacements = super.initializeReplacements({
        userId: filter?.userId,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      });

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM ${DB_SCHEMA}.role r
            INNER JOIN ${DB_SCHEMA}.user_role ur ON (r.id = ur.role_id)
            WHERE ur.user_id = :userId;   
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result: object[]) => {
        const countObj = result?.[0] as { count?: string | number } | undefined;
        return countObj ? Number(countObj.count) : 0;
      });

      response.data = await VARIAMOS_ORM.query<RoleModel>(
        `
        SELECT r.*
        FROM ${DB_SCHEMA}.role r
        INNER JOIN ${DB_SCHEMA}.user_role ur ON r.id = ur.role_id
        WHERE ur.user_id = :userId
        LIMIT :limit OFFSET :offset;
      `,
        {
          type: QueryTypes.SELECT,
          replacements,
        },
      ).then((res) => res.map(({ id, name }) => new Role(id, name)));
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryUserRoles:");
      logger.err(request);
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async queryUserRolesDetails(
    request: RequestModel<UserRoleFilter>,
  ): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter } = request;

      response.data = await RoleModel.findAll({
        include: [
          {
            model: UserModel,
            as: "users",
            where: { id: filter?.userId },
            attributes: [],
            through: { attributes: [] },
          },
          {
            model: PermissionModel,
            as: "permissions",
            attributes: ["id", "name"],
            through: { attributes: [] },
          },
        ],
        attributes: ["id", "name"],
      }).then((roles) =>
        roles.map((role) => {
          const typedRole = role as RoleModel & {
            permissions?: PermissionModel[];
          };
          return new Role(
            typedRole.id,
            typedRole.name,
            typedRole.permissions
              ? typedRole.permissions.map(
                  ({ id, name }) => new Permission(id, name),
                )
              : undefined,
          );
        }),
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryUserRolesDetails:");
      logger.err(request);
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async createUserRole(
    request: RequestModel<UserRole>,
  ): Promise<ResponseModel<UserRole>> {
    const response = new ResponseModel<UserRole>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "UserRole data is required.",
        );
      }

      const userId = data.userId;
      const roleId = data.roleId;
      if (!userId || !roleId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "userId and roleId are required.",
        );
      }

      const foundUserRole = await UserRoleModel.findOne({
        where: {
          userId,
          roleId,
        },
      });

      if (foundUserRole) {
        response.data = request.data;
      } else {
        const newUserRole = await UserRoleModel.create({
          userId,
          roleId,
        });

        response.data = new UserRole(newUserRole.userId, newUserRole.roleId);
      }
    } catch (error) {
      const err = error as Error;
      logger.err("Error in createUserRole:");
      logger.err(request);
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async deleteUserRole(
    request: RequestModel<UserRole>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "UserRole data is required.",
        );
      }

      const userId = data.userId;
      const roleId = data.roleId;
      if (!userId || !roleId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "userId and roleId are required.",
        );
      }

      await UserRoleModel.destroy({
        where: { userId, roleId },
      });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in deleteUserRole:");
      logger.err(request);
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}

export const UserRoleRepositoryInstance = new UserRoleRepositoryImpl();
