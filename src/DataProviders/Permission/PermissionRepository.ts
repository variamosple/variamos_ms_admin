import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { PermissionModel } from "./Permission";

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

export class PermissionRepositoryImpl {
  async queryPermissions(
    request: RequestModel<PermissionFilter>
  ): Promise<ResponseModel<Permission[]>> {
    const response = new ResponseModel<Permission[]>(request.transactionId);

    try {
      const { data: filter = new PermissionFilter() } = request;

      const replacements = initilizeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query(
        `
            SELECT COUNT(1)
            FROM variamos.permission
            WHERE (:name IS NULL OR name ILIKE '%' || :name || '%');
        `,
        { type: QueryTypes.SELECT, replacements }
      ).then((result: any) => +result?.[0]?.count || 0);

      response.data = await PermissionModel.findAll({
        where: {},
        limit: filter.pageSize!,
        offset: (filter.pageNumber! - 1) * filter.pageSize!,
      }).then((response) =>
        response.map(({ id, name }) => new Permission(id, name))
      );
    } catch (error) {
      logger.err("Error in getPermissions:");
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
