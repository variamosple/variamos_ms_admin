import { Op, QueryTypes, type WhereOptions } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserFilter } from "#src/Domain/User/Entity/UserFilter.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { BaseRepository } from "../BaseRepository.js";
import { CountryModel } from "../Countries/Country.js";
import { type UserAttributes, UserModel } from "./User.js";
import { accountOf, enrichUserRolesAndPermissions } from "./userRows.js";

/** The accounts: lists, reading, state and personal information. */
export class UserRepositoryImpl
  extends BaseRepository
  implements IUserRepository
{
  public async queryUsers(
    request: RequestModel<UserFilter>,
  ): Promise<ResponseModel<User[]>> {
    const response = new ResponseModel<User[]>(request.transactionId);

    try {
      const { data: filter = new UserFilter() } = request;

      const replacements = super.initializeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query<{ count: string }>(
        `
            SELECT COUNT(1) AS count
            FROM ${DB_SCHEMA}.user
            WHERE (:search IS NULL OR name ILIKE '%' || :search || '%' OR email ILIKE '%' || :search || '%')
              AND (:name IS NULL OR name ILIKE '%' || :name || '%');   
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result) => Number(result[0]?.count) || 0);

      const byName: WhereOptions<UserAttributes> = filter.name
        ? { name: { [Op.iLike]: `%${String(replacements.name)}%` } }
        : {};
      const where: WhereOptions<UserAttributes> = filter.search
        ? {
            [Op.or]: [
              { name: { [Op.iLike]: `%${String(replacements.search)}%` } },
              { email: { [Op.iLike]: `%${String(replacements.search)}%` } },
            ],
            ...byName,
          }
        : byName;

      const pageNumber = filter.pageNumber ?? 1;
      const pageSize = filter.pageSize ?? 10;

      response.data = await UserModel.findAll({
        where,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        // Never signed in users last in both directions; the id keeps the
        // pages stable between equal values
        order: [
          [filter.sortBy, `${filter.sortOrder.toUpperCase()} NULLS LAST`],
          ["id", "ASC"],
        ],
      }).then((res) =>
        res.map(
          ({
            id,
            user,
            name,
            email,
            isEnabled,
            isDeleted,
            createdAt,
            lastLogin,
          }) =>
            User.builder()
              .setId(id)
              .setUser(user)
              .setName(name)
              .setEmail(email)
              .setIsEnabled(isEnabled ?? true)
              .setIsDeleted(isDeleted ?? false)
              .setCreatedAt(createdAt ?? new Date())
              .setLastLogin(lastLogin)
              .build(),
        ),
      );
    } catch (error) {
      logger.err("Error in getUsers:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async findSessionUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data: userId } = request;

      if (!userId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "UserId is required",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
      });

      if (!dbUser) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        );
      }

      // The state goes with the user: the domain decides (AccountAccess)
      response.data = accountOf(dbUser);

      await enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      logger.err("Error in findSessionUser:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async queryById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      response.data = await UserModel.findOne({
        where: { id: data },
        include: [
          {
            model: CountryModel,
            as: "country",
          },
        ],
      }).then((res) => {
        if (!res) return undefined;
        return User.builder()
          .setId(res.id)
          .setUser(res.user)
          .setName(res.name)
          .setEmail(res.email)
          .setCountryCode(res.countryCode)
          .setCountryName(res.country?.name)
          .setIsEnabled(res.isEnabled ?? true)
          .setIsDeleted(res.isDeleted ?? false)
          .setCreatedAt(res.createdAt ?? new Date())
          .setLastLogin(res.lastLogin)
          .build();
      });
    } catch (error) {
      logger.err("Error in queryById:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async disableUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isEnabled: false,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      logger.err("Error in disableUser:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async enableUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isEnabled: true,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      logger.err("Error in enableUser:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async deleteUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isDeleted: true,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      logger.err("Error in deleteUser:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      const dbUser = await UserModel.findOne({
        where: { email },
      });

      if (!dbUser) {
        return null;
      }
      return User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .setIsEnabled(dbUser.isEnabled ?? true)
        .setIsDeleted(dbUser.isDeleted ?? false)
        .setCreatedAt(dbUser.createdAt || new Date())
        .build();
    } catch (error) {
      logger.err(`Error in getUserByEmail: ${error}`);
      return null;
    }
  }

  public async updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const personalInformation = request.data;
      if (!personalInformation) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Personal information data is required.",
        );
      }

      await UserModel.update(
        { countryCode: personalInformation.getCountryCode() ?? null },
        {
          where: {
            id: personalInformation.getUserId(),
          },
        },
      );
    } catch (error) {
      logger.err("Error in updatePersonalInformation:");
      logger.err(
        `Error trying to update user information with id: ${request.data ? request.data.getUserId() : ""}`,
      );
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}
