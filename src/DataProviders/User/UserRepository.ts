import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { User } from "@src/Domain/User/Entity/User";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";

import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import bcrypt from "bcrypt";
import logger from "jet-logger";
import { QueryTypes } from "sequelize";
import { PermissionModel } from "../Permission/Permission";
import { RoleModel } from "../Role/Role";
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
        order: [["created_at", "desc"], "name", "email"],
      }).then((response) =>
        response.map(
          ({
            id,
            name,
            user,
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
              .setIsEnabled(isEnabled!)
              .setIsDeleted(isDeleted!)
              .setCreatedAt(createdAt!)
              .setLastLogin(lastLogin)
              .build()
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

  async findSessionUser(
    request: RequestModel<string>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data: userId } = request;

      if (!userId) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "UserId is required"
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
      });

      if (!dbUser?.isEnabled) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Your account is disabled."
        );
      }

      if (dbUser?.isDeleted) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Your account is deleted."
        );
      }

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      logger.err("Error in findUser:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async findOrCreateUser(
    request: RequestModel<User>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(
          HttpStatusCodes.NOT_FOUND,
          "User information is required"
        );
      }

      const { email, user, name } = data;

      const [dbUser, crated] = await UserModel.findOrCreate({
        where: { email: email },
        defaults: {
          user,
          email,
          name,
          isEnabled: true,
          isDeleted: false,
          createdAt: new Date(),
          lastLogin: new Date(),
        },
      });

      if (!dbUser.isEnabled) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Your account is disabled."
        );
      }

      if (dbUser.isDeleted) {
        return response.withError(
          HttpStatusCodes.BAD_REQUEST,
          "Your account is deleted."
        );
      }

      if (!crated) {
        await UserModel.update(
          { lastLogin: new Date() },
          {
            where: {
              id: dbUser.id,
            },
          }
        );
      }

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
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

  async signIn(
    request: RequestModel<Credentials>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      const { email, password } = data!;

      const dbUser = await UserModel.findOne({
        where: { email: email },
      });

      const errorMessage = "Incorrect username or password.";

      if (
        !dbUser ||
        !dbUser.password ||
        !dbUser.isEnabled ||
        dbUser.isDeleted
      ) {
        return response.withError(HttpStatusCodes.BAD_REQUEST, errorMessage);
      }

      const passwordMatch = await bcrypt.compare(password, dbUser.password);

      if (!passwordMatch) {
        return response.withError(HttpStatusCodes.BAD_REQUEST, errorMessage);
      }

      await UserModel.update(
        { lastLogin: new Date() },
        {
          where: {
            id: dbUser.id,
          },
        }
      );

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      logger.err("Error in signIn:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async signUp(
    request: RequestModel<UserRegistration>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      const { email, password, name } = data!;

      const dbUser = await UserModel.findOne({
        where: { email: email },
      });

      if (!!dbUser) {
        logger.warn("User already registered");
        return response.withError(HttpStatusCodes.CONFLICT, "");
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await UserModel.create({
        user: name,
        name,
        email,
        password: hashedPassword,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        lastLogin: new Date(),
      });

      response.data = User.builder()
        .setId(newUser.id)
        .setUser(newUser.user)
        .setName(newUser.name)
        .setEmail(newUser.email)
        .build();
    } catch (error) {
      logger.err("Error in signUp:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      response.data = await UserModel.findOne({
        where: { id: data },
      }).then((response) =>
        !response
          ? undefined
          : User.builder()
              .setId(response.id)
              .setUser(response.user)
              .setName(response.name)
              .setEmail(response.email)
              .setIsEnabled(response.isEnabled!)
              .setIsDeleted(response.isDeleted!)
              .setCreatedAt(response.createdAt!)
              .setLastLogin(response.lastLogin)
              .build()
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

  async disableUser(
    request: RequestModel<string>
  ): Promise<ResponseModel<unknown>> {
    const response = new ResponseModel<unknown>(request.transactionId);

    try {
      const { data } = request;

      await UserModel.update(
        {
          isEnabled: false,
        },
        {
          where: { id: data },
        }
      );
    } catch (error) {
      logger.err("Error in disableUser:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async enableUser(
    request: RequestModel<string>
  ): Promise<ResponseModel<unknown>> {
    const response = new ResponseModel<unknown>(request.transactionId);

    try {
      const { data } = request;

      await UserModel.update(
        {
          isEnabled: true,
        },
        {
          where: { id: data },
        }
      );
    } catch (error) {
      logger.err("Error in enableUser:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async deleteUser(
    request: RequestModel<string>
  ): Promise<ResponseModel<unknown>> {
    const response = new ResponseModel<unknown>(request.transactionId);

    try {
      const { data } = request;

      await UserModel.update(
        {
          isDeleted: true,
        },
        {
          where: { id: data },
        }
      );
    } catch (error) {
      logger.err("Error in deleteUser:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  private async enrichUserRolesAndPermissions(user: User) {
    if (!user?.id) {
      return;
    }

    const replacements = initilizeReplacements({ userId: user.id });

    user.roles = await VARIAMOS_ORM.query<RoleModel>(
      `
        SELECT r.name
        FROM variamos.role r
        INNER JOIN variamos.user_role ur ON r.id = ur.role_id
        WHERE ur.user_id = :userId
      `,
      {
        type: QueryTypes.SELECT,
        replacements,
      }
    ).then((response) => response.map(({ name }) => name));

    user.permissions = await VARIAMOS_ORM.query<PermissionModel>(
      `
        SELECT p.name
        FROM variamos.user_role ur
        INNER JOIN variamos.role_permission rp ON ur.role_id = rp.role_id
        INNER JOIN variamos.permission p ON p.id = rp.permission_id
        WHERE ur.user_id = :userId
      `,
      {
        type: QueryTypes.SELECT,
        replacements,
      }
    ).then((response) => response.map(({ name }) => name));
  }
}

export const UserRepositoryInstance = new UserRepositoryImpl();
