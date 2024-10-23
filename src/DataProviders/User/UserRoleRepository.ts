import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";

import { UserRole } from "@src/Domain/User/Entity/UserRole";
import { UserRoleFilter } from "@src/Domain/User/Entity/UserRoleFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { BaseRepository } from "../BaseRepository";
import { RoleModel } from "../Role/Role";
import { UserRoleModel } from "./UserRole";

export class UserRoleRepositoryImpl extends BaseRepository {
  async queryUserRoles(
    request: RequestModel<UserRoleFilter>
  ): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter } = request;

      const replacements = super.initilizeReplacements({
        userId: filter?.userId,
        limit: filter?.pageSize,
        offset: (filter?.pageNumber! - 1) * filter?.pageSize!,
      });

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.role r
            INNER JOIN variamos.user_role ur ON (r.id = ur.role_id)
            WHERE ur.user_id = :userId;   
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      response.data = await VARIAMOS_ORM.query<RoleModel>(
        `
        SELECT r.*
        FROM variamos.role r
        INNER JOIN variamos.user_role ur ON r.id = ur.role_id
        WHERE ur.user_id = :userId
        LIMIT :limit OFFSET :offset;
      `,
        {
          type: QueryTypes.SELECT,
          replacements,
        }
      ).then((response) => response.map(({ id, name }) => new Role(id, name)));
    } catch (error) {
      logger.err("Error in queryUserRoles:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async createUserRole(
    request: RequestModel<UserRole>
  ): Promise<ResponseModel<UserRole>> {
    const response = new ResponseModel<UserRole>(request.transactionId);

    try {
      const { data } = request;

      const foundUserRole = await UserRoleModel.findOne({
        where: {
          userId: data?.userId!,
          roleId: data?.roleId!,
        },
      });

      if (foundUserRole) {
        response.data = request.data;
      } else {
        const newUserRole = await UserRoleModel.create({
          userId: data?.userId!,
          roleId: data?.roleId!,
        });

        response.data = new UserRole(newUserRole.userId, newUserRole.roleId);
      }
    } catch (error) {
      logger.err("Error in createUserRole:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async deleteUserRole(
    request: RequestModel<UserRole>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;

      await UserRoleModel.destroy({
        where: { userId: data?.userId!, roleId: data?.roleId! },
      });
    } catch (error) {
      logger.err("Error in deleteUserRole:");
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

export const UserRoleRepositoryInstance = new UserRoleRepositoryImpl();
