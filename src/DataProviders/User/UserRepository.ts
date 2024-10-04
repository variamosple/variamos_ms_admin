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
          ({ id, name, user, email, isEnabled, createdAt, lastLogin }) =>
            User.builder()
              .setId(id)
              .setUser(user)
              .setName(name)
              .setEmail(email)
              .setIsEnabled(isEnabled!)
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

  async findOrCreateUser(
    request: RequestModel<User>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(404, "User information is required");
      }

      const { email, user, name } = data;

      const [dbUser] = await UserModel.findOrCreate({
        where: { email: email },
        defaults: {
          user,
          email,
          name,
          isEnabled: true,
          createdAt: new Date(),
          lastLogin: new Date(),
        },
      });

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

      if (!dbUser || !dbUser.password) {
        return response.withError(400, errorMessage);
      }

      const passwordMatch = await bcrypt.compare(password, dbUser.password);

      if (!passwordMatch) {
        return response.withError(400, errorMessage);
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
}

export const UserRepositoryInstance = new UserRepositoryImpl();
