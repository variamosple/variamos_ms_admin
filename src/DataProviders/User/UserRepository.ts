import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { User } from "@src/Domain/User/Entity/User";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { UserModel } from "./User";

interface Replacements {
  [key: string]: any;
}

const initilizeReplacements = (filter: Replacements) => {
  if (!filter) {
    return {};
  }

  return Object.entries(filter).reduce<Replacements>((result, [key, value]) => {
    result[key] = value === undefined ? null : value;

    return result;
  }, {});
};

export class UserRepositoryImpl {
  async queryUsers(
    request: RequestModel<UserFilter>
  ): Promise<ResponseModel<User[]>> {
    const response = new ResponseModel<User[]>(request.transactionId);

    try {
      const { data: filter = new UserFilter() } = request;

      const replacements = initilizeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.user
            WHERE (:id IS NULL OR id = :id)
                AND (:name IS NULL OR name ILIKE '%' || :name || '%')
                AND (:user IS NULL OR user ILIKE '%' || :user || '%')
                AND (:email IS NULL OR email ILIKE '%' || :email || '%');
                 
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      response.data = await UserModel.findAll({
        where: {},
        limit: filter.pageSize!,
        offset: (filter.pageNumber! - 1) * filter.pageSize!,
      }).then((response) =>
        response.map(
          ({ id, name, user, email }) => new User(id, name, user, email)
        )
      );
    } catch (error) {
      logger.err("Error in getUsers:");
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

export const UserRepositoryInstance = new UserRepositoryImpl();
