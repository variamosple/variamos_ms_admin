import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { RoleModel } from "./Role";

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

export class RoleRepositoryImpl {
  async queryRoles(
    request: RequestModel<RoleFilter>
  ): Promise<ResponseModel<Role[]>> {
    const response = new ResponseModel<Role[]>(request.transactionId);

    try {
      const { data: filter = new RoleFilter() } = request;

      const replacements = initilizeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.role
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');   
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      response.data = await RoleModel.findAll({
        where: {},
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
}

export const RoleRepositoryInstance = new RoleRepositoryImpl();
